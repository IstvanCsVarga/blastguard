import { NextRequest, NextResponse } from "next/server";
import { createIncident, listIncidents, addFgaTuple } from "@/lib/db";
import { auditEvent } from "@/lib/audit";

export async function GET() {
  const incidents = await listIncidents();
  return NextResponse.json(incidents);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { title, description, severity, affected_service } = body;

  if (!title || !description || !severity || !affected_service) {
    return NextResponse.json(
      { error: "Missing required fields: title, description, severity, affected_service" },
      { status: 400 }
    );
  }

  const incident = await createIncident({ title, description, severity, affected_service });

  // JIT permission grant: create read-only FGA tuple for the affected service
  await addFgaTuple({
    incident_id: incident.id,
    agent: "blastguard",
    relation: "reader",
    service: affected_service,
  });

  await auditEvent(
    incident.id,
    "incident_created",
    "operator",
    `Incident ${incident.id} created: ${title}`,
    `Severity: ${severity}, Service: ${affected_service}`
  );

  await auditEvent(
    incident.id,
    "permission_granted",
    "system",
    `FGA: Read-only access granted to agent for service: ${affected_service}`,
    `Tuple written: blastguard -> reader -> ${affected_service}`
  );

  return NextResponse.json(incident, { status: 201 });
}
