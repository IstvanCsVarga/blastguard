import { NextRequest, NextResponse } from "next/server";
import { getIncident, getAuditLog, getAllTuples } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incident = await getIncident(id);

  if (!incident) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const auditLog = await getAuditLog(id);
  const tuples = await getAllTuples(id);

  return NextResponse.json({ incident, auditLog, tuples });
}
