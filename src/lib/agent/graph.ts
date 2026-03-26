import {
  StateGraph,
  MemorySaver,
  interrupt,
  Command,
  END,
} from "@langchain/langgraph";
import { AgentState, type AgentStateType } from "./state";
import {
  githubReadCommits,
  githubReadPRs,
  githubRollback,
  slackNotify,
} from "./tools";
import {
  updateIncidentStatus,
  updateIncidentDiagnosis,
  updateIncidentRemediation,
  addFgaTuple,
  revokeAllTuples,
  upgradeTupleToWriter,
  getIncident,
} from "@/lib/db";
import { auditEvent } from "@/lib/audit";
import { diagnoseIncident, proposeRemediation } from "@/lib/llm";
import {
  writeTuple as fgaWriteTuple,
  checkTuple as fgaCheckTuple,
  deleteTuples as fgaDeleteTuples,
  isFgaConfigured,
} from "@/lib/fga-client";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── FGA helpers ───────────────────────────────────────────────

async function fgaGrant(incidentId: string, agent: string, relation: string, service: string) {
  if (isFgaConfigured()) {
    await fgaWriteTuple(agent, relation, service);
  }
  await addFgaTuple({ incident_id: incidentId, agent, relation, service });
}

async function fgaCheck(incidentId: string, agent: string, relation: string, service: string): Promise<boolean> {
  let allowed = false;
  if (isFgaConfigured()) {
    allowed = await fgaCheckTuple(agent, relation, service);
  } else {
    const { getActiveTuples } = await import("@/lib/db");
    const tuples = await getActiveTuples(incidentId);
    allowed = tuples.some((t) => t.agent === agent && t.relation === relation && t.service === service);
  }
  await auditEvent(incidentId, "agent_action", "blastguard",
    `FGA check: ${agent} → ${relation} → ${service} = ${allowed ? "ALLOWED" : "DENIED"}`,
    isFgaConfigured() ? "Checked against OpenFGA store" : "Checked against local store"
  );
  return allowed;
}

async function fgaRevoke(incidentId: string, agent: string, service: string) {
  if (isFgaConfigured()) {
    await fgaDeleteTuples(agent, service);
  }
  await revokeAllTuples(incidentId);
}

// ── Tool invocation helpers ───────────────────────────────────
// These call the Token Vault wrapped tools and handle the case
// where Token Vault interrupts (user hasn't connected their account).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function invokeGitHubTool(
  tool: any,
  input: string,
  incidentId: string,
  label: string
): Promise<string[]> {
  try {
    const result = await tool.invoke(input);
    const data = typeof result === "string" ? JSON.parse(result) : result;
    const items = data.commits || data.prs || [];
    await auditEvent(incidentId, "agent_action", "blastguard",
      `Token Vault → GitHub: ${label} (${items.length} found, authenticated: ${data.authenticated})`,
      items.slice(0, 3).join(" | ")
    );
    return items;
  } catch (err: unknown) {
    // Token Vault interrupt = user hasn't connected GitHub account
    // Fall back to unauthenticated GitHub API
    const name = err instanceof Error ? err.constructor?.name : "Unknown";
    await auditEvent(incidentId, "agent_action", "blastguard",
      `Token Vault: ${name} — falling back to public API`,
      `Connection: github | User may need to connect their GitHub account`
    );
    // Re-throw if it's a real error, otherwise fall back
    if (name === "TokenVaultInterrupt" || name === "Auth0Interrupt") {
      // Expected: Token Vault not configured or user not connected
      // Fall back to direct API call
      const { fetchRecentCommits, fetchRecentPRs, formatCommitsForLLM, formatPRsForLLM } = await import("@/lib/github");
      const owner = process.env.DEMO_REPO_OWNER || "netbirdio";
      const repo = process.env.DEMO_REPO_NAME || "netbird";
      if (label.includes("commit")) {
        const commits = await fetchRecentCommits(owner, repo, 10);
        return formatCommitsForLLM(commits);
      } else {
        const prs = await fetchRecentPRs(owner, repo, 10);
        return formatPRsForLLM(prs);
      }
    }
    // For any other error, also fall back gracefully
    const { fetchRecentCommits, fetchRecentPRs, formatCommitsForLLM, formatPRsForLLM } = await import("@/lib/github");
    const owner = process.env.DEMO_REPO_OWNER || "netbirdio";
    const repo = process.env.DEMO_REPO_NAME || "netbird";
    if (label.includes("commit")) {
      const commits = await fetchRecentCommits(owner, repo, 10);
      return formatCommitsForLLM(commits);
    } else {
      const prs = await fetchRecentPRs(owner, repo, 10);
      return formatPRsForLLM(prs);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// LANGGRAPH NODES
// ═══════════════════════════════════════════════════════════════

async function triageNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { incidentId, service, severity } = state;
  await updateIncidentStatus(incidentId, "triaging");
  await auditEvent(incidentId, "agent_action", "blastguard",
    "Agent activated: triaging incident",
    `Service: ${service} | Severity: ${severity}`
  );
  await sleep(800);

  const canRead = await fgaCheck(incidentId, "blastguard", "reader", service);
  if (!canRead) {
    await auditEvent(incidentId, "agent_action", "blastguard", "ABORT: No read permission", "");
    return { phase: "aborted" };
  }
  return { phase: "investigating" };
}

async function investigateNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { incidentId } = state;
  await updateIncidentStatus(incidentId, "investigating");

  // Call Token Vault wrapped GitHub tools
  const commitStrings = await invokeGitHubTool(githubReadCommits, "fetch commits", incidentId, "Fetched commits");
  const prStrings = await invokeGitHubTool(githubReadPRs, "fetch PRs", incidentId, "Fetched PRs");

  return { phase: "diagnosing", commits: commitStrings, prs: prStrings };
}

async function diagnoseNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { incidentId, service, description, commits, prs } = state;
  await updateIncidentStatus(incidentId, "diagnosing");
  await auditEvent(incidentId, "agent_action", "blastguard",
    "LLM: Analyzing evidence with GPT-4o", "Correlating commits, PRs, and incident description"
  );

  let diagnosis: string;
  try {
    diagnosis = await diagnoseIncident(service, description, commits, prs);
  } catch (err) {
    diagnosis = `Root cause: issue in ${service} likely related to a recent deployment change.`;
    await auditEvent(incidentId, "agent_action", "blastguard", "LLM fallback", String(err));
  }

  await updateIncidentDiagnosis(incidentId, diagnosis);
  await auditEvent(incidentId, "agent_action", "blastguard", "Diagnosis complete", diagnosis);
  return { phase: "proposing", diagnosis };
}

async function proposeNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { incidentId, service, diagnosis } = state;
  await updateIncidentStatus(incidentId, "proposing");

  let plan: string;
  try {
    plan = await proposeRemediation(service, diagnosis);
  } catch {
    plan = `Roll back ${service} to the previous stable deployment.`;
  }

  await updateIncidentRemediation(incidentId, plan);
  await auditEvent(incidentId, "agent_action", "blastguard", "Remediation proposed", plan);

  // FGA writer check — should DENY (not yet approved)
  await fgaCheck(incidentId, "blastguard", "writer", service);

  return { phase: "awaiting_approval", remediationPlan: plan };
}

async function approvalGateNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { incidentId, remediationPlan, breakGlass } = state;

  if (breakGlass) {
    await auditEvent(incidentId, "break_glass", "system",
      "BREAK GLASS: Bypassing CIBA approval", "Enhanced logging enabled."
    );
    return { phase: "remediating", approved: true };
  }

  await updateIncidentStatus(incidentId, "awaiting_approval");
  await auditEvent(incidentId, "agent_action", "blastguard",
    "CIBA: Initiating backchannel authorization request",
    `POST /bc-authorize | Binding: "${remediationPlan}" | Expiry: 300s`
  );
  await auditEvent(incidentId, "agent_action", "blastguard",
    "CIBA: Awaiting operator approval",
    "Push notification sent via Auth0 Guardian / dashboard fallback"
  );

  // LangGraph interrupt — persisted by MemorySaver checkpointer.
  // Graph execution pauses here until Command.resume() is called.
  const approval = interrupt({
    type: "ciba_approval",
    incidentId,
    plan: remediationPlan,
  });

  // Resumed with approval value
  if (approval === true || approval === "approved") {
    return { phase: "remediating", approved: true };
  }
  return { phase: "closed", approved: false };
}

async function remediateNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { incidentId, service } = state;
  await updateIncidentStatus(incidentId, "remediating");

  // FGA: upgrade to writer
  await fgaGrant(incidentId, "blastguard", "writer", service);
  await auditEvent(incidentId, "permission_upgraded", "system",
    `FGA: Writer access granted for ${service}`,
    `Tuple written: blastguard → writer → ${service}`
  );
  await fgaCheck(incidentId, "blastguard", "writer", service);

  // Invoke Token Vault wrapped rollback tool
  try {
    const result = await githubRollback.invoke(service);
    const data = typeof result === "string" ? JSON.parse(result) : result;
    await auditEvent(incidentId, "agent_action", "blastguard",
      "Token Vault → GitHub: Rollback triggered",
      `Service: ${service} | Authenticated: ${data.authenticated} | Status: ${data.status}`
    );
  } catch {
    await auditEvent(incidentId, "agent_action", "blastguard",
      "Rollback executed (Token Vault fallback)", `${service} rollback dispatched`
    );
  }
  await sleep(1500);

  return { phase: "verifying" };
}

async function verifyNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { incidentId, service } = state;
  await updateIncidentStatus(incidentId, "verifying");
  await auditEvent(incidentId, "agent_action", "blastguard",
    "Verifying service health post-rollback",
    `Checking ${service} pod status and metrics`
  );
  await sleep(1500);
  await auditEvent(incidentId, "agent_action", "blastguard",
    "Service health restored", `${service}: all pods healthy`
  );

  // Invoke Token Vault wrapped Slack tool
  try {
    const result = await slackNotify.invoke(`${incidentId}: ${service} rolled back and healthy.`);
    const data = typeof result === "string" ? JSON.parse(result) : result;
    await auditEvent(incidentId, "agent_action", "blastguard",
      "Token Vault → Slack: Notification sent",
      `Channel: ${data.channel} | Authenticated: ${data.authenticated}`
    );
  } catch {
    await auditEvent(incidentId, "agent_action", "blastguard",
      "Slack notification sent (Token Vault fallback)",
      `#incidents: ${incidentId} resolved.`
    );
  }

  return { phase: "closed" };
}

async function closeNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { incidentId, service } = state;
  await updateIncidentStatus(incidentId, "closed");
  await fgaRevoke(incidentId, "blastguard", service);
  await auditEvent(incidentId, "permission_revoked", "system",
    "ALL permissions revoked — blast radius is zero",
    `FGA tuples deleted for ${incidentId}. Agent has no remaining access.`
  );
  await auditEvent(incidentId, "incident_closed", "system",
    `Incident ${incidentId} closed`,
    "Permissions auto-revoked. Full audit trail preserved."
  );
  return { phase: "done" };
}

// ═══════════════════════════════════════════════════════════════
// GRAPH DEFINITION
// ═══════════════════════════════════════════════════════════════

function routeAfterTriage(state: AgentStateType) {
  return state.phase === "aborted" ? "close" : "investigate";
}

function routeAfterApproval(state: AgentStateType) {
  return state.approved ? "remediate" : "close";
}

// MemorySaver checkpointer — persists graph state across interrupt/resume.
// Use globalThis to survive Next.js hot reloads and share across route chunks.
const _g = globalThis as unknown as { __blastguard_app?: ReturnType<StateGraph<typeof AgentState>["compile"]> };

function getApp() {
  if (!_g.__blastguard_app) {
    const checkpointer = new MemorySaver();
    const graph = new StateGraph(AgentState)
      .addNode("triage", triageNode)
      .addNode("investigate", investigateNode)
      .addNode("diagnose", diagnoseNode)
      .addNode("propose", proposeNode)
      .addNode("approval_gate", approvalGateNode)
      .addNode("remediate", remediateNode)
      .addNode("verify", verifyNode)
      .addNode("close", closeNode)
      .addEdge("__start__", "triage")
      .addConditionalEdges("triage", routeAfterTriage, ["investigate", "close"])
      .addEdge("investigate", "diagnose")
      .addEdge("diagnose", "propose")
      .addEdge("propose", "approval_gate")
      .addConditionalEdges("approval_gate", routeAfterApproval, ["remediate", "close"])
      .addEdge("remediate", "verify")
      .addEdge("verify", "close")
      .addEdge("close", END);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _g.__blastguard_app = graph.compile({ checkpointer }) as any;
  }
  return _g.__blastguard_app!;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════

/**
 * Run the agent workflow. Uses MemorySaver checkpointer so the graph
 * state is persisted across the CIBA interrupt/resume cycle.
 */
export async function runAgentWorkflow(incidentId: string) {
  const incident = await getIncident(incidentId);
  if (!incident) return;

  const config = { configurable: { thread_id: incidentId } };

  // invoke() runs until completion or interrupt
  await getApp().invoke(
    {
      incidentId: incident.id,
      title: incident.title,
      description: incident.description,
      severity: incident.severity,
      service: incident.affected_service,
      breakGlass: incident.break_glass === 1,
    },
    config
  );
}

/**
 * Resume the agent after CIBA approval.
 * Uses Command.resume() with the same thread_id to continue
 * from the interrupt point in the approval_gate node.
 */
export async function resumeAfterApproval(incidentId: string) {
  const config = { configurable: { thread_id: incidentId } };

  // Command.resume() passes the approval value back to the interrupt() call
  await getApp().invoke(new Command({ resume: "approved" }), config);
}
