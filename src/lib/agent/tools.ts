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
  description: "Fetch recent commits from the affected service's GitHub repository",
  func: async (): Promise<string> => {
    let token: string | undefined;
    try {
      token = getAccessTokenFromTokenVault();
    } catch {
      // Token Vault not available — proceed without auth
    }

    const commits = await fetchRecentCommits(DEMO_REPO_OWNER, DEMO_REPO_NAME, 10, token);
    const formatted = formatCommitsForLLM(commits);
    return JSON.stringify({ commits: formatted, count: commits.length, authenticated: !!token });
  },
});

const fetchPRsTool = new DynamicTool({
  name: "fetch_github_prs",
  description: "Fetch recent pull requests from the affected service's GitHub repository",
  func: async (): Promise<string> => {
    let token: string | undefined;
    try {
      token = getAccessTokenFromTokenVault();
    } catch {
      // proceed without auth
    }

    const prs = await fetchRecentPRs(DEMO_REPO_OWNER, DEMO_REPO_NAME, 10, token);
    const formatted = formatPRsForLLM(prs);
    return JSON.stringify({ prs: formatted, count: prs.length, authenticated: !!token });
  },
});

const rollbackDeploymentTool = new DynamicTool({
  name: "rollback_deployment",
  description: "Execute a rollback of the affected service via GitHub Actions workflow dispatch",
  func: async (input: string): Promise<string> => {
    let token: string | undefined;
    try {
      token = getAccessTokenFromTokenVault();
    } catch {
      // proceed without auth
    }

    // In production: POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches
    // with Authorization: Bearer {token}
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
  description: "Post an incident update to the #incidents Slack channel",
  func: async (input: string): Promise<string> => {
    let token: string | undefined;
    try {
      token = getAccessTokenFromTokenVault();
    } catch {
      // proceed without auth
    }

    // In production: POST https://slack.com/api/chat.postMessage
    // with Authorization: Bearer {token}
    return JSON.stringify({
      status: "sent",
      channel: "#incidents",
      message: input,
      authenticated: !!token,
    });
  },
});

// ── Token Vault wrapped tools ─────────────────────────────────
// withTokenVault wraps the tool so that before execution, the SDK
// exchanges the user's Auth0 access token for the provider's token
// via RFC 8693 token exchange. The exchanged token is then available
// inside the tool via getAccessTokenFromTokenVault().

export const githubReadCommits = auth0AI.withTokenVault(
  {
    connection: "github",
    scopes: ["repo:status", "read:org"],
    // accessToken is injected via LangGraph configurable at runtime
    accessToken: (_args: unknown[], config: Record<string, unknown>) => {
      const configurable = config?.configurable as Record<string, string> | undefined;
      return configurable?.auth0_access_token;
    },
  },
  fetchCommitsTool
);

export const githubReadPRs = auth0AI.withTokenVault(
  {
    connection: "github",
    scopes: ["repo:status", "read:org"],
    accessToken: (_args: unknown[], config: Record<string, unknown>) => {
      const configurable = config?.configurable as Record<string, string> | undefined;
      return configurable?.auth0_access_token;
    },
  },
  fetchPRsTool
);

export const githubRollback = auth0AI.withTokenVault(
  {
    connection: "github",
    scopes: ["repo", "workflow"],
    accessToken: (_args: unknown[], config: Record<string, unknown>) => {
      const configurable = config?.configurable as Record<string, string> | undefined;
      return configurable?.auth0_access_token;
    },
  },
  rollbackDeploymentTool
);

export const slackNotify = auth0AI.withTokenVault(
  {
    connection: "slack",
    scopes: ["chat:write", "channels:read"],
    accessToken: (_args: unknown[], config: Record<string, unknown>) => {
      const configurable = config?.configurable as Record<string, string> | undefined;
      return configurable?.auth0_access_token;
    },
  },
  slackNotifyTool
);

// ── CIBA + Token Vault wrapped remediation tool ───────────────
// This wraps the rollback tool with BOTH Token Vault (for GitHub
// write token) AND CIBA (for async human authorization).
// When invoked, it:
// 1. Initiates CIBA backchannel request to Auth0
// 2. Waits for operator approval (push notification / polling)
// 3. On approval, exchanges for GitHub write token via Token Vault
// 4. Executes the rollback

export const cibaProtectedRollback = auth0AI.withAsyncAuthorization(
  {
    scopes: ["incident:remediate"],
    userID: (_args: unknown[], config: Record<string, unknown>) => {
      const configurable = config?.configurable as Record<string, string> | undefined;
      return configurable?.operator_id || "operator";
    },
    bindingMessage: (_args: unknown[], config: Record<string, unknown>) => {
      const configurable = config?.configurable as Record<string, string> | undefined;
      return `[${configurable?.thread_id}] Approve deployment rollback for ${configurable?.service || "service"}`;
    },
    requestedExpiry: 300,
    audience: process.env.AUTH0_AUDIENCE,
  },
  rollbackDeploymentTool
);
