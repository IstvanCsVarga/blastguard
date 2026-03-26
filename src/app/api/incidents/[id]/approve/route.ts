import { NextRequest, NextResponse } from "next/server";
import { getIncident } from "@/lib/db";
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

  if (incident.status !== "awaiting_approval") {
    return NextResponse.json(
      { error: "Incident is not awaiting approval" },
      { status: 400 }
    );
  }

  await auditEvent(
    id,
    "human_approval",
    "operator",
    "CIBA: Operator approved remediation",
    `Approved: ${incident.remediation_plan}`
  );

  // Resume the LangGraph from the interrupt point using Command.resume()
  resumeAfterApproval(id).catch(console.error);

  return NextResponse.json({ message: "Approved", incident_id: id });
}
