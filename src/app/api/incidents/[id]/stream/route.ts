import { NextRequest, NextResponse } from "next/server";
import { getIncident } from "@/lib/db";
import { runAgentWorkflow } from "@/lib/agent-workflow";

export async function POST(
  _req: NextRequest,
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

  // Run LangGraph agent workflow asynchronously
  runAgentWorkflow(id).catch((err) => {
    // Interrupts are expected (CIBA approval gate)
    if (err?.name !== "GraphInterrupt") {
      console.error("Agent workflow error:", err);
    }
  });

  return NextResponse.json({ message: "Agent deployed", incident_id: id });
}
