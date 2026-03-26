import { NextRequest, NextResponse } from "next/server";
import { getIncident, setBreakGlass } from "@/lib/db";
import { auditEvent } from "@/lib/audit";
import { resumeAfterApproval } from "@/lib/agent-workflow";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incident = await getIncident(id);

  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  if (incident.status === "closed") {
    return NextResponse.json({ error: "Incident already closed" }, { status: 400 });
  }

  await setBreakGlass(id, true);

  await auditEvent(id, "break_glass", "operator",
    "BREAK GLASS activated by operator",
    "CIBA approval bypass enabled. Enhanced logging active."
  );

  if (incident.status === "awaiting_approval") {
    await auditEvent(id, "break_glass", "system",
      "BREAK GLASS: Bypassing pending CIBA approval",
      "Resuming LangGraph from interrupt point"
    );
    // Resume the graph — break glass flag is checked in the approval_gate node
    resumeAfterApproval(id).catch(console.error);
  }

  return NextResponse.json({ message: "Break glass activated", incident_id: id });
}
