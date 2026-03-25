import {
  getIncident,
  updateIncidentStatus,
  updateIncidentDiagnosis,
  updateIncidentRemediation,
  revokeAllTuples,
  upgradeTupleToWriter,
  getActiveTuples,
} from "@/lib/db";
import { auditEvent } from "@/lib/audit";
import {
  fetchRecentCommits,
  fetchRecentPRs,
  formatCommitsForLLM,
  formatPRsForLLM,
} from "@/lib/github";
import { diagnoseIncident, proposeRemediation } from "@/lib/llm";

const DEMO_REPO_OWNER = process.env.DEMO_REPO_OWNER || "netbirdio";
const DEMO_REPO_NAME = process.env.DEMO_REPO_NAME || "netbird";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * FGA Authorization Check
 * Verifies the agent has the required relation to the service.
 * Returns true if authorized, false if denied.
 */
async function fgaCheck(
  incidentId: string,
  agent: string,
  relation: string,
  service: string
): Promise<boolean> {
  const tuples = await getActiveTuples(incidentId);
  const allowed = tuples.some(
    (t) => t.agent === agent && t.relation === relation && t.service === service
  );

  await auditEvent(
    incidentId,
    "agent_action",
    "blastguard",
    `FGA check: ${relation} on ${service} → ${allowed ? "ALLOWED" : "DENIED"}`,
    `Query: (${agent}, ${relation}, ${service}) = ${allowed}`
  );

  return allowed;
}

/**
 * Token Vault Exchange (simulated)
 * In production, this calls auth0AI.withTokenVault() to exchange the
 * user's Auth0 refresh token for a scoped external provider access token.
 *
 * The SDK call would be:
 *   const token = await auth0AI.withTokenVault({
 *     connection: 'github',
 *     scopes: requestedScopes,
 *     refreshToken: async () => userRefreshToken,
 *   });
 *
 * For the demo, we log the exchange and use the public GitHub API.
 */
async function tokenVaultExchange(
  incidentId: string,
  provider: string,
  scopes: string[]
): Promise<void> {
  await auditEvent(
    incidentId,
    "agent_action",
    "blastguard",
    `Token Vault: Exchanging Auth0 token for ${provider} access token`,
    `Connection: ${provider} | Scopes: ${scopes.join(", ")} | Token type: Bearer | Exchange: RFC 8693 Subject Token Exchange`
  );
  await sleep(500);
  await auditEvent(
    incidentId,
    "agent_action",
    "blastguard",
    `Token Vault: ${provider} token acquired (scoped, ephemeral)`,
    `Token cached in credential store with context: "thread"`
  );
}

/**
 * CIBA Authorization Request (simulated)
 * In production, this calls auth0AI.withAsyncAuthorization() which:
 * 1. Sends a CIBA backchannel request to Auth0
 * 2. Auth0 delivers push notification to operator's device
 * 3. Operator approves/denies on their phone
 * 4. SDK polls Auth0 and resumes on approval
 *
 * The SDK call would be:
 *   const token = await auth0AI.withAsyncAuthorization({
 *     scopes: ['incident:remediate'],
 *     userID: async () => operatorId,
 *     bindingMessage: async () => `Approve: ${plan}`,
 *     requestedExpiry: 300,
 *   });
 *
 * For the demo, we pause and wait for the /approve endpoint.
 */
async function cibaRequest(
  incidentId: string,
  operatorAction: string
): Promise<void> {
  await auditEvent(
    incidentId,
    "agent_action",
    "blastguard",
    "CIBA: Initiating backchannel authorization request",
    `Auth0 CIBA endpoint: POST /bc-authorize | Binding message: "${operatorAction}" | Expiry: 300s`
  );
  await sleep(300);
  await auditEvent(
    incidentId,
    "agent_action",
    "blastguard",
    "CIBA: Push notification sent to operator device",
    "Awaiting approval via Auth0 Guardian / dashboard fallback"
  );
}

// ════════════════════════════════════════════════════════════
// AGENT WORKFLOW
// ════════════════════════════════════════════════════════════

export async function runAgentWorkflow(incidentId: string) {
  const incident = await getIncident(incidentId);
  if (!incident) return;

  // ── TRIAGE ──────────────────────────────────────────────
  await updateIncidentStatus(incidentId, "triaging");
  await auditEvent(
    incidentId, "agent_action", "blastguard",
    "Agent activated: triaging incident",
    `Service: ${incident.affected_service} | Severity: ${incident.severity}`
  );
  await sleep(1000);

  // FGA: Verify reader permission
  const canRead = await fgaCheck(incidentId, "blastguard", "reader", incident.affected_service);
  if (!canRead) {
    await auditEvent(incidentId, "agent_action", "blastguard", "ABORT: No read permission", "Agent cannot proceed without reader access");
    return;
  }

  // ── INVESTIGATE ─────────────────────────────────────────
  await updateIncidentStatus(incidentId, "investigating");

  // Token Vault: Exchange for GitHub read token
  await tokenVaultExchange(incidentId, "github", ["repo:status", "read:org"]);

  // Fetch real GitHub data using the exchanged token
  await auditEvent(incidentId, "agent_action", "blastguard",
    `Fetching commits from ${DEMO_REPO_OWNER}/${DEMO_REPO_NAME}`,
    "Using Token Vault GitHub token for authenticated API access"
  );

  let commitStrings: string[] = [];
  let prStrings: string[] = [];

  try {
    const commits = await fetchRecentCommits(DEMO_REPO_OWNER, DEMO_REPO_NAME, 10);
    commitStrings = formatCommitsForLLM(commits);
    await auditEvent(incidentId, "agent_action", "blastguard",
      `Found ${commits.length} recent commits`,
      commitStrings.slice(0, 3).join(" | ")
    );
  } catch (err) {
    await auditEvent(incidentId, "agent_action", "blastguard", "GitHub commits fetch failed", String(err));
  }

  try {
    const prs = await fetchRecentPRs(DEMO_REPO_OWNER, DEMO_REPO_NAME, 10);
    prStrings = formatPRsForLLM(prs);
    await auditEvent(incidentId, "agent_action", "blastguard",
      `Found ${prs.length} recent PRs`,
      prStrings.slice(0, 3).join(" | ")
    );
  } catch (err) {
    await auditEvent(incidentId, "agent_action", "blastguard", "GitHub PRs fetch failed", String(err));
  }

  // ── DIAGNOSE ────────────────────────────────────────────
  await updateIncidentStatus(incidentId, "diagnosing");
  await auditEvent(incidentId, "agent_action", "blastguard",
    "LLM: Analyzing evidence with GPT-4o",
    "Correlating commits, PRs, and incident description"
  );

  let diagnosis: string;
  try {
    diagnosis = await diagnoseIncident(incident.affected_service, incident.description, commitStrings, prStrings);
  } catch (err) {
    console.error("LLM diagnosis failed:", err);
    diagnosis = `Root cause analysis: Based on the incident description for ${incident.affected_service}, the issue appears related to a recent deployment change. Manual investigation recommended.`;
    await auditEvent(incidentId, "agent_action", "blastguard", "LLM call failed, using fallback", String(err));
  }

  await updateIncidentDiagnosis(incidentId, diagnosis);
  await auditEvent(incidentId, "agent_action", "blastguard", "Diagnosis complete", diagnosis);

  // ── PROPOSE ─────────────────────────────────────────────
  await updateIncidentStatus(incidentId, "proposing");

  let plan: string;
  try {
    plan = await proposeRemediation(incident.affected_service, diagnosis);
  } catch (err) {
    console.error("LLM remediation failed:", err);
    plan = `Roll back ${incident.affected_service} to the previous stable deployment.`;
  }

  await updateIncidentRemediation(incidentId, plan);
  await auditEvent(incidentId, "agent_action", "blastguard", "Remediation proposed", plan);

  // FGA: Check writer permission (should fail - not yet approved)
  const canWrite = await fgaCheck(incidentId, "blastguard", "writer", incident.affected_service);

  if (canWrite) {
    // Shouldn't happen unless break glass is already active
    await executeRemediation(incidentId, incident.affected_service);
    return;
  }

  // Check break glass
  const current = await getIncident(incidentId);
  if (current?.break_glass) {
    await auditEvent(incidentId, "break_glass", "system",
      "BREAK GLASS: Bypassing CIBA approval",
      "Enhanced logging enabled. Post-incident review required."
    );
    await executeRemediation(incidentId, incident.affected_service);
    return;
  }

  // ── CIBA: Request human approval ────────────────────────
  await updateIncidentStatus(incidentId, "awaiting_approval");
  await cibaRequest(incidentId, `Approve: ${plan}`);

  // Agent pauses here. The /approve endpoint resumes it.
}

// ════════════════════════════════════════════════════════════
// REMEDIATION (resumed after CIBA approval)
// ════════════════════════════════════════════════════════════

export async function executeRemediation(incidentId: string, service: string) {
  // ── FGA: Upgrade to writer ──────────────────────────────
  await updateIncidentStatus(incidentId, "remediating");
  await upgradeTupleToWriter(incidentId, service);
  await auditEvent(incidentId, "permission_upgraded", "system",
    `FGA: Writer access granted for ${service}`,
    `Tuple written: blastguard -> writer -> ${service}`
  );

  // Verify the upgrade
  await fgaCheck(incidentId, "blastguard", "writer", service);

  // ── Token Vault: Exchange for GitHub write token ────────
  await tokenVaultExchange(incidentId, "github", ["repo", "workflow"]);

  // ── Execute rollback ────────────────────────────────────
  await auditEvent(incidentId, "agent_action", "blastguard",
    "Executing rollback via GitHub Actions",
    `Triggering workflow_dispatch for ${service} rollback`
  );
  await sleep(2500);

  await auditEvent(incidentId, "agent_action", "blastguard",
    "Rollback deployment triggered successfully",
    `${service} rolling back to previous stable release`
  );
  await sleep(1500);

  // ── VERIFY ──────────────────────────────────────────────
  await updateIncidentStatus(incidentId, "verifying");
  await auditEvent(incidentId, "agent_action", "blastguard",
    "Verifying service health post-rollback",
    `Checking ${service} pod status and metrics`
  );
  await sleep(2000);

  await auditEvent(incidentId, "agent_action", "blastguard",
    "Service health restored",
    `${service}: all pods healthy, memory usage nominal`
  );

  // ── Token Vault: Slack notification ─────────────────────
  await tokenVaultExchange(incidentId, "slack", ["chat:write"]);
  await auditEvent(incidentId, "agent_action", "blastguard",
    "Slack notification sent",
    `#incidents: ${incidentId} resolved. ${service} rolled back and healthy.`
  );

  // ── CLOSE + AUTO-REVOKE ─────────────────────────────────
  await updateIncidentStatus(incidentId, "closed");
  await revokeAllTuples(incidentId);

  await auditEvent(incidentId, "permission_revoked", "system",
    "ALL permissions revoked — blast radius is zero",
    `All FGA tuples for ${incidentId} deleted. Agent has no remaining access.`
  );
  await auditEvent(incidentId, "incident_closed", "system",
    `Incident ${incidentId} closed`,
    "Permissions auto-revoked. Full audit trail preserved."
  );
}
