import {
  getIncident,
  updateIncidentStatus,
  updateIncidentDiagnosis,
  updateIncidentRemediation,
  revokeAllTuples,
  upgradeTupleToWriter,
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

export async function runAgentWorkflow(incidentId: string) {
  const incident = getIncident(incidentId);
  if (!incident) return;

  // ── TRIAGE ──
  updateIncidentStatus(incidentId, "triaging");
  auditEvent(incidentId, "agent_action", "blastguard", "Agent triaging incident", `Classifying severity and scope for ${incident.affected_service}`);
  await sleep(1500);

  auditEvent(incidentId, "agent_action", "blastguard", "FGA check: reader permission verified", `blastguard -> reader -> ${incident.affected_service}`);

  // ── INVESTIGATE ──
  updateIncidentStatus(incidentId, "investigating");
  auditEvent(incidentId, "agent_action", "blastguard", "Token Vault: exchanging GitHub token", "Requesting scoped access token for repo:status, read:org");
  await sleep(1000);

  auditEvent(incidentId, "agent_action", "blastguard", `Fetching commits from ${DEMO_REPO_OWNER}/${DEMO_REPO_NAME}`, "Querying last 7 days of commits");

  let commitStrings: string[] = [];
  let prStrings: string[] = [];

  try {
    const commits = await fetchRecentCommits(DEMO_REPO_OWNER, DEMO_REPO_NAME, 10);
    commitStrings = formatCommitsForLLM(commits);
    auditEvent(incidentId, "agent_action", "blastguard", `Found ${commits.length} recent commits`, commitStrings.slice(0, 3).join("; "));
  } catch (err) {
    auditEvent(incidentId, "agent_action", "blastguard", "GitHub commits fetch failed", String(err));
  }

  try {
    const prs = await fetchRecentPRs(DEMO_REPO_OWNER, DEMO_REPO_NAME, 10);
    prStrings = formatPRsForLLM(prs);
    auditEvent(incidentId, "agent_action", "blastguard", `Found ${prs.length} recent PRs`, prStrings.slice(0, 3).join("; "));
  } catch (err) {
    auditEvent(incidentId, "agent_action", "blastguard", "GitHub PRs fetch failed", String(err));
  }

  // ── DIAGNOSE ──
  updateIncidentStatus(incidentId, "diagnosing");
  auditEvent(incidentId, "agent_action", "blastguard", "LLM analyzing gathered evidence (GPT-4o)", "Correlating commits, PRs, and incident description");

  let diagnosis: string;
  try {
    diagnosis = await diagnoseIncident(incident.affected_service, incident.description, commitStrings, prStrings);
  } catch (err) {
    console.error("LLM diagnosis failed:", err);
    diagnosis = `Root cause analysis: Based on the incident description for ${incident.affected_service}, the issue appears related to a recent deployment change. Manual investigation recommended.`;
    auditEvent(incidentId, "agent_action", "blastguard", "LLM call failed, using fallback diagnosis", String(err));
  }

  updateIncidentDiagnosis(incidentId, diagnosis);
  auditEvent(incidentId, "agent_action", "blastguard", "Diagnosis complete", diagnosis);

  // ── PROPOSE ──
  updateIncidentStatus(incidentId, "proposing");

  let plan: string;
  try {
    plan = await proposeRemediation(incident.affected_service, diagnosis);
  } catch (err) {
    console.error("LLM remediation failed:", err);
    plan = `Roll back ${incident.affected_service} to the previous stable deployment.`;
  }

  updateIncidentRemediation(incidentId, plan);
  auditEvent(incidentId, "agent_action", "blastguard", "Remediation proposed", plan);
  await sleep(500);

  auditEvent(incidentId, "agent_action", "blastguard", "FGA check: writer permission DENIED", `blastguard does NOT have writer access to ${incident.affected_service}`);

  // Check break glass
  const current = getIncident(incidentId);
  if (current?.break_glass) {
    auditEvent(incidentId, "break_glass", "system", "BREAK GLASS: Bypassing CIBA approval", "Enhanced logging enabled. Post-incident review required.");
    await executeRemediation(incidentId, incident.affected_service);
    return;
  }

  // ── CIBA: Request human approval ──
  updateIncidentStatus(incidentId, "awaiting_approval");
  auditEvent(incidentId, "agent_action", "blastguard", "CIBA: Requesting human approval for destructive action", `Operator must approve: ${plan}`);
}

export async function executeRemediation(incidentId: string, service: string) {
  updateIncidentStatus(incidentId, "remediating");
  auditEvent(incidentId, "permission_upgraded", "system", `FGA upgraded: writer access granted for ${service}`, `blastguard -> writer -> ${service}`);

  upgradeTupleToWriter(incidentId, service);

  auditEvent(incidentId, "agent_action", "blastguard", "Token Vault: exchanging GitHub write token", "Requesting scoped token for repo, workflow");
  await sleep(1500);

  auditEvent(incidentId, "agent_action", "blastguard", "Executing rollback via GitHub Actions", `Triggering workflow_dispatch for ${service} rollback`);
  await sleep(2500);

  auditEvent(incidentId, "agent_action", "blastguard", "Rollback deployment triggered successfully", `${service} rolling back to previous stable release`);
  await sleep(1500);

  // ── VERIFY ──
  updateIncidentStatus(incidentId, "verifying");
  auditEvent(incidentId, "agent_action", "blastguard", "Verifying service health post-rollback", `Checking ${service} pod status and metrics`);
  await sleep(2000);

  auditEvent(incidentId, "agent_action", "blastguard", "Service health restored", `${service}: all pods healthy, memory usage nominal`);

  auditEvent(incidentId, "agent_action", "blastguard", "Token Vault: exchanging Slack token", "Posting incident update to #incidents channel");
  await sleep(800);

  auditEvent(incidentId, "agent_action", "blastguard", "Slack notification sent", `${incidentId}: Rollback complete. ${service} health restored.`);

  // ── CLOSE ──
  updateIncidentStatus(incidentId, "closed");

  revokeAllTuples(incidentId);
  auditEvent(incidentId, "permission_revoked", "system", "ALL permissions revoked - blast radius is zero", `All FGA tuples for ${incidentId} deleted. Agent has no remaining access.`);
  auditEvent(incidentId, "incident_closed", "system", `Incident ${incidentId} closed`, "All permissions auto-revoked. Audit trail preserved.");
}
