import { v4 as uuid } from "uuid";

// In-memory store with globalThis persistence to survive Next.js hot reloads.
// For a production system this would be a real database.

type StoreState = {
  incidents: Map<string, Incident>;
  auditEntries: AuditEntry[];
  fgaTuples: FgaTuple[];
};

const globalStore = globalThis as unknown as { __blastguard_store?: StoreState };

function getStore(): StoreState {
  if (!globalStore.__blastguard_store) {
    globalStore.__blastguard_store = {
      incidents: new Map(),
      auditEntries: [],
      fgaTuples: [],
    };
  }
  return globalStore.__blastguard_store;
}

export type Incident = {
  id: string;
  title: string;
  description: string;
  severity: string;
  affected_service: string;
  status: string;
  break_glass: number;
  diagnosis: string | null;
  remediation_plan: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type AuditEntry = {
  id: string;
  incident_id: string;
  event_type: string;
  actor: string;
  action: string;
  details: string | null;
  permissions_snapshot: string | null;
  created_at: string;
};

export type FgaTuple = {
  id: string;
  incident_id: string;
  agent: string;
  relation: string;
  service: string;
  active: number;
  created_at: string;
  revoked_at: string | null;
};

// Use getStore() accessors for hot-reload persistence
function incidents() { return getStore().incidents; }
function auditEntries() { return getStore().auditEntries; }
function fgaTuples() { return getStore().fgaTuples; }

function now(): string {
  return new Date().toISOString();
}

export function createIncident(data: {
  title: string;
  description: string;
  severity: string;
  affected_service: string;
}): Incident {
  const id = `INC-${uuid().slice(0, 8).toUpperCase()}`;
  const incident: Incident = {
    id,
    title: data.title,
    description: data.description,
    severity: data.severity,
    affected_service: data.affected_service,
    status: "open",
    break_glass: 0,
    diagnosis: null,
    remediation_plan: null,
    created_at: now(),
    updated_at: now(),
    closed_at: null,
  };
  incidents().set(id, incident);
  return { ...incident };
}

export function getIncident(id: string): Incident | undefined {
  const inc = incidents().get(id);
  return inc ? { ...inc } : undefined;
}

export function listIncidents(): Incident[] {
  return Array.from(incidents().values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((i) => ({ ...i }));
}

export function updateIncidentStatus(id: string, status: string): void {
  const inc = incidents().get(id);
  if (!inc) return;
  inc.status = status;
  inc.updated_at = now();
  if (status === "closed") inc.closed_at = now();
}

export function updateIncidentDiagnosis(id: string, diagnosis: string): void {
  const inc = incidents().get(id);
  if (!inc) return;
  inc.diagnosis = diagnosis;
  inc.updated_at = now();
}

export function updateIncidentRemediation(id: string, plan: string): void {
  const inc = incidents().get(id);
  if (!inc) return;
  inc.remediation_plan = plan;
  inc.updated_at = now();
}

export function setBreakGlass(id: string, enabled: boolean): void {
  const inc = incidents().get(id);
  if (!inc) return;
  inc.break_glass = enabled ? 1 : 0;
  inc.updated_at = now();
}

export function addAuditEntry(data: {
  incident_id: string;
  event_type: string;
  actor: string;
  action: string;
  details?: string;
  permissions_snapshot?: string;
}): AuditEntry {
  const entry: AuditEntry = {
    id: uuid(),
    incident_id: data.incident_id,
    event_type: data.event_type,
    actor: data.actor,
    action: data.action,
    details: data.details ?? null,
    permissions_snapshot: data.permissions_snapshot ?? null,
    created_at: now(),
  };
  auditEntries().push(entry);
  return { ...entry };
}

export function getAuditLog(incidentId: string): AuditEntry[] {
  return auditEntries()
    .filter((e) => e.incident_id === incidentId)
    .map((e) => ({ ...e }));
}

export function addFgaTuple(data: {
  incident_id: string;
  agent: string;
  relation: string;
  service: string;
}): FgaTuple {
  const tuple: FgaTuple = {
    id: uuid(),
    incident_id: data.incident_id,
    agent: data.agent,
    relation: data.relation,
    service: data.service,
    active: 1,
    created_at: now(),
    revoked_at: null,
  };
  fgaTuples().push(tuple);
  return { ...tuple };
}

export function getActiveTuples(incidentId: string): FgaTuple[] {
  return fgaTuples()
    .filter((t) => t.incident_id === incidentId && t.active === 1)
    .map((t) => ({ ...t }));
}

export function getAllTuples(incidentId: string): FgaTuple[] {
  return fgaTuples()
    .filter((t) => t.incident_id === incidentId)
    .map((t) => ({ ...t }));
}

export function revokeAllTuples(incidentId: string): void {
  const ts = now();
  for (const t of fgaTuples()) {
    if (t.incident_id === incidentId && t.active === 1) {
      t.active = 0;
      t.revoked_at = ts;
    }
  }
}

export function upgradeTupleToWriter(incidentId: string, service: string): void {
  const exists = fgaTuples().some(
    (t) => t.incident_id === incidentId && t.service === service && t.relation === "writer" && t.active === 1
  );
  if (!exists) {
    addFgaTuple({
      incident_id: incidentId,
      agent: "blastguard",
      relation: "writer",
      service,
    });
  }
}
