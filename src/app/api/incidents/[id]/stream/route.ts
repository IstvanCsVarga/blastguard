import { NextRequest, NextResponse } from "next/server";
import { getIncident } from "@/lib/db";
import { runAgentWorkflow } from "@/lib/agent-workflow";
import { auth0 } from "@/lib/auth0";

/**
 * Attempt Token Vault exchange directly via Auth0's token endpoint.
 * This runs OUTSIDE LangGraph so a failure can't freeze the graph.
 * Returns the GitHub access token on success, undefined on failure.
 */
async function exchangeTokenVault(auth0AccessToken: string): Promise<string | undefined> {
  try {
    const domain = process.env.AUTH0_DOMAIN || process.env.AUTH0_ISSUER_BASE_URL?.replace("https://", "");
    const res = await fetch(`https://${domain}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
        client_id: process.env.AUTH0_AI_CLIENT_ID || process.env.AUTH0_CLIENT_ID,
        client_secret: process.env.AUTH0_AI_CLIENT_SECRET || process.env.AUTH0_CLIENT_SECRET,
        subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
        subject_token: auth0AccessToken,
        connection: "github",
        requested_token_type: "http://auth0.com/oauth/token-type/federated-connection-access-token",
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.access_token;
    }
    const err = await res.text();
    console.error("Token Vault exchange failed:", res.status, err);
  } catch (e) {
    console.error("Token Vault exchange error:", e);
  }
  return undefined;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incident = await getIncident(id);

  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  if (incident.status !== "open") {
    return NextResponse.json({ error: "Incident already in progress" }, { status: 400 });
  }

  // Get the operator's Auth0 access token for Token Vault exchange
  let accessToken: string | undefined;
  try {
    const tokenResult = await auth0.getAccessToken();
    accessToken = tokenResult?.token;
  } catch {
    // No session or token — agent will fall back to unauthenticated API calls
  }

  // Pre-exchange: attempt Token Vault exchange BEFORE the graph starts.
  // Two paths: SDK's getAccessTokenForConnection (uses session refresh token)
  // and direct HTTP exchange (uses access token). Either gives us a GitHub token.
  let githubToken: string | undefined;

  // Path 1: SDK's built-in Token Vault method (uses MRRT + refresh token)
  try {
    const result = await auth0.getAccessTokenForConnection({ connection: "github" });
    githubToken = result?.token;
  } catch {
    // Connected Account may not exist yet — try direct exchange
  }

  // Path 2: Direct Token Vault exchange via Custom API Client
  if (!githubToken && accessToken) {
    githubToken = await exchangeTokenVault(accessToken);
  }

  // Run LangGraph agent with both tokens in config
  runAgentWorkflow(id, accessToken, githubToken).catch((err) => {
    if (err?.name !== "GraphInterrupt") {
      console.error("Agent workflow error:", err);
    }
  });

  return NextResponse.json({ message: "Agent deployed", incident_id: id });
}
