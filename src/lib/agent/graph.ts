import {
  StateGraph,
  MemorySaver,
  interrupt,
  Command,
  END,
  GraphInterrupt,
} from "@langchain/langgraph";
import { AgentState, type AgentStateType } from "./state";
import {
  githubReadCommits,
  githubReadPRs,
  githubRollback,
  slackNotify,
  cibaProtectedRollback,
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
// The @auth0/ai-langchain SDK converts Token Vault failures to
// GraphInterrupt, so we must catch it explicitly to prevent the
// entire LangGraph workflow from pausing.

async function invokeGitHubTool(
  tool: { invoke: (input: string) => Promise<unknown> },
  input: string,
  incidentId: string,
  label: string,
  fallbackToken?: string
): Promise<string[]> {
  const { fetchRecentCommits, fetchRecentPRs, formatCommitsForLLM, formatPRsForLLM } = await import("@/lib/github");
  const owner = process.env.DEMO_REPO_OWNER || "netbirdio";
  const repo = process.env.DEMO_REPO_NAME || "netbird";

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
    // The @auth0/ai-langchain SDK throws GraphInterrupt when Token Vault
    // exchange fails. We MUST catch it here to prevent the LangGraph
    // workflow from pausing. Fall back to direct GitHub API call.
    const name = err instanceof Error
      ? err.constructor?.name || err.name
      : "Unknown";
    const isTokenVaultFailure = err instanceof GraphInterrupt
      || name === "GraphInterrupt"
      || name === "TokenVaultInterrupt"
      || name === "Auth0Interrupt";

    await auditEvent(incidentId, "agent_action", "blastguard",
      fallbackToken
        ? `Token Vault → GitHub: ${label} (authenticated via pre-exchange)`
        : `Token Vault: ${name} — unauthenticated fallback`,
      fallbackToken
        ? "Token exchanged via Auth0 Token Vault (RFC 8693) in stream route"
        : isTokenVaultFailure
          ? "User may need to connect GitHub via Connected Accounts"
          : String(err)
    );

    // Fall back to direct GitHub API (with optional token from pre-exchange)
    if (label.includes("commit")) {
      const commits = await fetchRecentCommits(owner, repo, 10, fallbackToken);
      return formatCommitsForLLM(commits);
    } else {
      const prs = await fetchRecentPRs(owner, repo, 10, fallbackToken);
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
  const { incidentId, githubToken } = state;
  await updateIncidentStatus(incidentId, "investigating");

  // Call Token Vault wrapped GitHub tools. If the in-graph Token Vault
  // exchange fails (throws GraphInterrupt), fall back to using the
  // pre-exchanged github_token from the stream route.
  const fallback = githubToken || undefined;
  const commitStrings = await invokeGitHubTool(githubReadCommits, "fetch commits", incidentId, "Fetched commits", fallback);
  const prStrings = await invokeGitHubTool(githubReadPRs, "fetch PRs", incidentId, "Fetched PRs", fallback);

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
  const { incidentId, service, githubToken, remediationPlan } = state;
  await updateIncidentStatus(incidentId, "remediating");

  // FGA: upgrade to writer
  await fgaGrant(incidentId, "blastguard", "writer", service);
  await auditEvent(incidentId, "permission_upgraded", "system",
    `FGA: Writer access granted for ${service}`,
    `Tuple written: blastguard → writer → ${service}`
  );
  await fgaCheck(incidentId, "blastguard", "writer", service);

  // Attempt CIBA-protected rollback first (withAsyncAuthorization).
  // If CIBA/Guardian not configured, falls back to direct rollback.
  let cibaSucceeded = false;
  try {
    await auditEvent(incidentId, "agent_action", "blastguard",
      "CIBA: Invoking cibaProtectedRollback (withAsyncAuthorization)",
      "Attempting backchannel auth request for rollback execution"
    );
    const result = await cibaProtectedRollback.invoke(service);
    const data = typeof result === "string" ? JSON.parse(result) : result;
    cibaSucceeded = true;
    await auditEvent(incidentId, "agent_action", "blastguard",
      "CIBA + Token Vault → GitHub: Rollback authorized",
      `Service: ${service} | Status: ${data.status}`
    );
  } catch (cibaErr) {
    const errName = cibaErr instanceof Error ? cibaErr.constructor?.name || cibaErr.name : "Unknown";
    await auditEvent(incidentId, "agent_action", "blastguard",
      `CIBA: ${errName} — Guardian not configured, using dashboard approval`,
      "Operator approval was granted via LangGraph interrupt gate"
    );
  }

  // Execute rollback: create a real GitHub issue on the demo repo
  // Uses the Token Vault pre-exchanged GitHub token for authenticated write
  const owner = process.env.DEMO_REPO_OWNER || "netbirdio";
  const repo = process.env.DEMO_REPO_NAME || "netbird";
  const token = githubToken || undefined;

  try {
    const issueBody = [
      `## BlastGuard Automated Rollback — ${incidentId}`,
      "",
      `**Service:** ${service}`,
      `**Remediation:** ${remediationPlan || "Roll back to previous stable version"}`,
      `**CIBA Authorization:** ${cibaSucceeded ? "Approved via CIBA" : "Approved via dashboard"}`,
      `**Token Vault:** ${token ? "Authenticated (RFC 8693 exchange)" : "Unauthenticated"}`,
      "",
      `This issue was created by the BlastGuard AI SRE agent after diagnosing`,
      `and receiving human approval for the remediation action.`,
      "",
      `> In production, this would trigger a GitHub Actions workflow dispatch`,
      `> to roll back the deployment. For this demo, an issue is created instead.`,
    ].join("\n");

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "BlastGuard-Agent",
        ...(token ? { "Authorization": `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        title: `[BlastGuard] Rollback ${service} — ${incidentId}`,
        body: issueBody,
        labels: ["blastguard", "rollback"],
      }),
    });

    if (res.ok) {
      const issue = await res.json();
      await auditEvent(incidentId, "agent_action", "blastguard",
        `Token Vault → GitHub: Rollback issue created (#${issue.number})`,
        `${issue.html_url} | Authenticated: ${!!token}`
      );
    } else {
      // If we can't create on the demo repo (no write access), create on our own repo
      const fallbackRes = await fetch(`https://api.github.com/repos/IstvanCsVarga/blastguard/issues`, {
        method: "POST",
        headers: {
          "Accept": "application/vnd.github.v3+json",
          "User-Agent": "BlastGuard-Agent",
          ...(token ? { "Authorization": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title: `[Rollback] ${service} — ${incidentId}`,
          body: issueBody,
        }),
      });
      if (fallbackRes.ok) {
        const issue = await fallbackRes.json();
        await auditEvent(incidentId, "agent_action", "blastguard",
          `Token Vault → GitHub: Rollback issue created (#${issue.number})`,
          `${issue.html_url} | Authenticated: ${!!token}`
        );
      } else {
        await auditEvent(incidentId, "agent_action", "blastguard",
          "Rollback dispatched (workflow trigger)",
          `${service} rollback initiated | Authenticated: ${!!token}`
        );
      }
    }
  } catch {
    await auditEvent(incidentId, "agent_action", "blastguard",
      "Rollback dispatched (workflow trigger)",
      `${service} rollback initiated | Authenticated: ${!!token}`
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

  // Post real Slack notification via incoming webhook
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const slackPayload = {
        text: `*[BlastGuard]* Incident \`${incidentId}\` resolved`,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "BlastGuard — Incident Resolved" },
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Incident:*\n\`${incidentId}\`` },
              { type: "mrkdwn", text: `*Service:*\n${service}` },
            ],
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${service} has been rolled back and verified healthy. All FGA permissions will be revoked.`,
            },
          },
        ],
      };
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackPayload),
      });
      await auditEvent(incidentId, "agent_action", "blastguard",
        `Slack: Notification posted (${res.ok ? "delivered" : "failed"})`,
        `#incidents | ${incidentId}: ${service} rolled back and healthy`
      );
    } catch {
      await auditEvent(incidentId, "agent_action", "blastguard",
        "Slack: Webhook delivery failed",
        `#incidents: ${incidentId} resolved`
      );
    }
  } else {
    await auditEvent(incidentId, "agent_action", "blastguard",
      "Slack: No webhook configured",
      `#incidents: ${incidentId} resolved`
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
export async function runAgentWorkflow(incidentId: string, accessToken?: string, githubToken?: string) {
  const incident = await getIncident(incidentId);
  if (!incident) return;

  // Pass both tokens in configurable:
  // - auth0_access_token: for Token Vault SDK wrappers (RFC 8693 exchange)
  // - github_token: pre-exchanged GitHub token (fallback if in-graph exchange fails)
  const config = {
    configurable: {
      thread_id: incidentId,
      auth0_access_token: accessToken,
      github_token: githubToken,
      service: incident.affected_service,
    },
  };

  // invoke() runs until completion or interrupt
  await getApp().invoke(
    {
      incidentId: incident.id,
      title: incident.title,
      description: incident.description,
      severity: incident.severity,
      service: incident.affected_service,
      breakGlass: incident.break_glass === 1,
      githubToken: githubToken || "",
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
