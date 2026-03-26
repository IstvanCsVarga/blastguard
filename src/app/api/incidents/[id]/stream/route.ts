import { NextRequest, NextResponse } from "next/server";
import { getIncident } from "@/lib/db";
import { runAgentWorkflow } from "@/lib/agent-workflow";
import { auth0 } from "@/lib/auth0";

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

  // Run LangGraph agent with the user's token in config
  runAgentWorkflow(id, accessToken).catch((err) => {
    if (err?.name !== "GraphInterrupt") {
      console.error("Agent workflow error:", err);
    }
  });

  return NextResponse.json({ message: "Agent deployed", incident_id: id });
}
