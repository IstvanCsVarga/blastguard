import { addAuditEntry, getActiveTuples } from "./db";

export function auditEvent(
  incidentId: string,
  eventType: string,
  actor: string,
  action: string,
  details?: string
) {
  const tuples = getActiveTuples(incidentId);
  const snapshot = JSON.stringify(
    tuples.map((t) => ({
      agent: t.agent,
      relation: t.relation,
      service: t.service,
    }))
  );

  return addAuditEntry({
    incident_id: incidentId,
    event_type: eventType,
    actor,
    action,
    details,
    permissions_snapshot: snapshot,
  });
}
