import { Auth0AI } from "@auth0/ai-langchain";

/**
 * Auth0 AI SDK instance.
 * Provides Token Vault (credential exchange) and CIBA (async authorization).
 */
export const auth0AI = new Auth0AI();

/**
 * Token Vault wrapper for GitHub read access.
 * Exchanges the user's Auth0 refresh token for a scoped GitHub access token.
 * Scopes: repo:status, read:org (read-only investigation).
 */
export const withGitHubRead = auth0AI.withTokenVault({
  connection: "github",
  scopes: ["repo:status", "read:org"],
});

/**
 * Token Vault wrapper for GitHub write access.
 * Exchanges for a token with repo + workflow scopes (for rollback).
 */
export const withGitHubWrite = auth0AI.withTokenVault({
  connection: "github",
  scopes: ["repo", "workflow"],
});

/**
 * Token Vault wrapper for Slack access.
 * Exchanges for a Slack token to post incident updates.
 */
export const withSlackNotify = auth0AI.withTokenVault({
  connection: "slack",
  scopes: ["chat:write", "channels:read"],
});

/**
 * CIBA wrapper for remediation approval.
 * Triggers a backchannel authorization request to the operator.
 * The operator must approve on their device before the agent can proceed.
 */
export const withRemediationApproval = auth0AI.withAsyncAuthorization({
  scopes: ["incident:remediate"],
  userID: async (args: Record<string, unknown>) => {
    return (args.operator_id as string) || "operator";
  },
  bindingMessage: async (args: Record<string, unknown>) => {
    const service = args.service as string || "unknown";
    const plan = args.plan as string || "remediation";
    const incidentId = args.incident_id as string || "unknown";
    return `[${incidentId}] Approve: ${plan} on ${service}`;
  },
  requestedExpiry: 300,
  audience: process.env.AUTH0_AUDIENCE,
});
