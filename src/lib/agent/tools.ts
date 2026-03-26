import { DynamicTool } from "@langchain/core/tools";
import { auth0AI } from "@/lib/auth0-ai";
import { getAccessTokenFromTokenVault } from "@auth0/ai-langchain";
import {
  fetchRecentCommits,
  fetchRecentPRs,
  formatCommitsForLLM,
  formatPRsForLLM,
} from "@/lib/github";

const DEMO_REPO_OWNER = process.env.DEMO_REPO_OWNER || "netbirdio";
const DEMO_REPO_NAME = process.env.DEMO_REPO_NAME || "netbird";

// ── Raw tool implementations ──────────────────────────────────

const fetchCommitsTool = new DynamicTool({
  name: "fetch_github_commits",
  description: "Fetch recent commits from the affected service's GitHub repository using Token Vault credentials",
  func: async (_input: string): Promise<string> => {
    // Get the Token Vault exchanged token (if available)
    let token: string | undefined;
    try {
      token = getAccessTokenFromTokenVault();
    } catch {
      // Token Vault not available (e.g., no user session) — proceed without auth
    }

    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const commits = await fetchRecentCommits(DEMO_REPO_OWNER, DEMO_REPO_NAME, 10);
    const formatted = formatCommitsForLLM(commits);
    return JSON.stringify({ commits: formatted, count: commits.length, authenticated: !!token });
  },
});

const fetchPRsTool = new DynamicTool({
  name: "fetch_github_prs",
  description: "Fetch recent pull requests from the affected service's GitHub repository using Token Vault credentials",
  func: async (_input: string): Promise<string> => {
    let token: string | undefined;
    try {
      token = getAccessTokenFromTokenVault();
    } catch {
      // proceed without auth
    }

    const prs = await fetchRecentPRs(DEMO_REPO_OWNER, DEMO_REPO_NAME, 10);
    const formatted = formatPRsForLLM(prs);
    return JSON.stringify({ prs: formatted, count: prs.length, authenticated: !!token });
  },
});

const rollbackDeploymentTool = new DynamicTool({
  name: "rollback_deployment",
  description: "Execute a rollback of the affected service via GitHub Actions workflow dispatch. Requires write access.",
  func: async (input: string): Promise<string> => {
    let token: string | undefined;
    try {
      token = getAccessTokenFromTokenVault();
    } catch {
      // proceed without auth for demo
    }

    // In production, this would trigger a GitHub Actions workflow_dispatch
    // using the Token Vault write token:
    //   POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches
    //   Authorization: Bearer {token}
    return JSON.stringify({
      status: "triggered",
      service: input,
      authenticated: !!token,
      message: `Rollback workflow dispatched for ${input}`,
    });
  },
});

const slackNotifyTool = new DynamicTool({
  name: "slack_notify",
  description: "Post an incident update to the #incidents Slack channel using Token Vault Slack credentials",
  func: async (input: string): Promise<string> => {
    let token: string | undefined;
    try {
      token = getAccessTokenFromTokenVault();
    } catch {
      // proceed without auth for demo
    }

    // In production, this would call Slack API with the Token Vault token:
    //   POST https://slack.com/api/chat.postMessage
    //   Authorization: Bearer {token}
    return JSON.stringify({
      status: "sent",
      channel: "#incidents",
      message: input,
      authenticated: !!token,
    });
  },
});

// ── Token Vault wrapped tools ─────────────────────────────────
// These use auth0AI.withTokenVault() to automatically exchange
// the user's Auth0 token for the external provider's access token
// before the tool executes.

export const githubReadCommits = auth0AI.withTokenVault(
  {
    connection: "github",
    scopes: ["repo:status", "read:org"],
  },
  fetchCommitsTool
);

export const githubReadPRs = auth0AI.withTokenVault(
  {
    connection: "github",
    scopes: ["repo:status", "read:org"],
  },
  fetchPRsTool
);

export const githubRollback = auth0AI.withTokenVault(
  {
    connection: "github",
    scopes: ["repo", "workflow"],
  },
  rollbackDeploymentTool
);

export const slackNotify = auth0AI.withTokenVault(
  {
    connection: "slack",
    scopes: ["chat:write", "channels:read"],
  },
  slackNotifyTool
);

// ── CIBA wrapped remediation tool ─────────────────────────────
// This wraps the rollback tool with CIBA async authorization.
// When invoked, it triggers a backchannel auth request to Auth0.

export const cibaProtectedRollback = auth0AI.withAsyncAuthorization(
  {
    scopes: ["incident:remediate"],
    userID: async () => "operator",
    bindingMessage: async () => "Approve deployment rollback for incident remediation",
    requestedExpiry: 300,
    audience: process.env.AUTH0_AUDIENCE,
  },
  rollbackDeploymentTool
);
