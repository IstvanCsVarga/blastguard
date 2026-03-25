import { NextRequest, NextResponse } from "next/server";
import { getIncident, getAuditLog, getAllTuples } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incident = getIncident(id);

  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const auditLog = getAuditLog(id);
  const tuples = getAllTuples(id);

  return NextResponse.json({
    incident,
    auditLog,
    tuples,
  });
}
