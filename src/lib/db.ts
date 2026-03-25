import { Redis } from "@upstash/redis";
import { v4 as uuid } from "uuid";

// Upstash Redis for serverless persistence.
// Falls back to in-memory store if no Redis URL configured (local dev).

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

// ── Redis Client ──

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    return _redis;
  }
  return null;
}

// ── In-Memory Fallback (for local dev without Redis) ──

type MemStore = {
  incidents: Map<string, Incident>;
  audit: AuditEntry[];
  tuples: FgaTuple[];
};
const g = globalThis as unknown as { __bg?: MemStore };
function mem(): MemStore {
  if (!g.__bg) g.__bg = { incidents: new Map(), audit: [], tuples: [] };
  return g.__bg;
}

// ── Helper ──

function now(): string {
  return new Date().toISOString();
}

// ── Incidents ──

export async function createIncident(data: {
  title: string;
  description: string;
  severity: string;
  affected_service: string;
}): Promise<Incident> {
  const id = `INC-${uuid().slice(0, 8).toUpperCase()}`;
  const incident: Incident = {
    id,
    ...data,
    status: "open",
    break_glass: 0,
    diagnosis: null,
    remediation_plan: null,
    created_at: now(),
    updated_at: now(),
    closed_at: null,
  };

  const redis = getRedis();
  if (redis) {
    await redis.set(`incident:${id}`, JSON.stringify(incident));
    await redis.lpush("incidents:ids", id);
  } else {
    mem().incidents.set(id, incident);
  }
  return incident;
}

export async function getIncident(id: string): Promise<Incident | undefined> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.get<string>(`incident:${id}`);
    if (!raw) return undefined;
    return typeof raw === "string" ? JSON.parse(raw) : raw as unknown as Incident;
  }
  const inc = mem().incidents.get(id);
  return inc ? { ...inc } : undefined;
}

export async function listIncidents(): Promise<Incident[]> {
  const redis = getRedis();
  if (redis) {
    const ids = await redis.lrange<string>("incidents:ids", 0, -1);
    if (!ids || ids.length === 0) return [];
    const results = await Promise.all(ids.map((id) => getIncident(id)));
    return results.filter(Boolean) as Incident[];
  }
  return Array.from(mem().incidents.values())
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function updateIncidentField(id: string, updates: Partial<Incident>): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const inc = await getIncident(id);
    if (!inc) return;
    const updated = { ...inc, ...updates, updated_at: now() };
    await redis.set(`incident:${id}`, JSON.stringify(updated));
  } else {
    const inc = mem().incidents.get(id);
    if (!inc) return;
    Object.assign(inc, updates, { updated_at: now() });
  }
}

export async function updateIncidentStatus(id: string, status: string): Promise<void> {
  const extra: Partial<Incident> = { status };
  if (status === "closed") extra.closed_at = now();
  await updateIncidentField(id, extra);
}

export async function updateIncidentDiagnosis(id: string, diagnosis: string): Promise<void> {
  await updateIncidentField(id, { diagnosis });
}

export async function updateIncidentRemediation(id: string, plan: string): Promise<void> {
  await updateIncidentField(id, { remediation_plan: plan });
}

export async function setBreakGlass(id: string, enabled: boolean): Promise<void> {
  await updateIncidentField(id, { break_glass: enabled ? 1 : 0 });
}

// ── Audit Log ──

export async function addAuditEntry(data: {
  incident_id: string;
  event_type: string;
  actor: string;
  action: string;
  details?: string;
  permissions_snapshot?: string;
}): Promise<AuditEntry> {
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

  const redis = getRedis();
  if (redis) {
    await redis.rpush(`audit:${data.incident_id}`, JSON.stringify(entry));
  } else {
    mem().audit.push(entry);
  }
  return entry;
}

export async function getAuditLog(incidentId: string): Promise<AuditEntry[]> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.lrange<string>(`audit:${incidentId}`, 0, -1);
    return (raw ?? []).map((r) => (typeof r === "string" ? JSON.parse(r) : r) as AuditEntry);
  }
  return mem().audit.filter((e) => e.incident_id === incidentId);
}

// ── FGA Tuples ──

export async function addFgaTuple(data: {
  incident_id: string;
  agent: string;
  relation: string;
  service: string;
}): Promise<FgaTuple> {
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

  const redis = getRedis();
  if (redis) {
    await redis.rpush(`tuples:${data.incident_id}`, JSON.stringify(tuple));
  } else {
    mem().tuples.push(tuple);
  }
  return tuple;
}

async function getTuplesRaw(incidentId: string): Promise<FgaTuple[]> {
  const redis = getRedis();
  if (redis) {
    const raw = await redis.lrange<string>(`tuples:${incidentId}`, 0, -1);
    return (raw ?? []).map((r) => (typeof r === "string" ? JSON.parse(r) : r) as FgaTuple);
  }
  return mem().tuples.filter((t) => t.incident_id === incidentId);
}

export async function getActiveTuples(incidentId: string): Promise<FgaTuple[]> {
  return (await getTuplesRaw(incidentId)).filter((t) => t.active === 1);
}

export async function getAllTuples(incidentId: string): Promise<FgaTuple[]> {
  return getTuplesRaw(incidentId);
}

export async function revokeAllTuples(incidentId: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    const tuples = await getTuplesRaw(incidentId);
    const ts = now();
    const updated = tuples.map((t) =>
      t.active === 1 ? { ...t, active: 0, revoked_at: ts } : t
    );
    await redis.del(`tuples:${incidentId}`);
    if (updated.length > 0) {
      await redis.rpush(`tuples:${incidentId}`, ...updated.map((t) => JSON.stringify(t)));
    }
  } else {
    const ts = now();
    for (const t of mem().tuples) {
      if (t.incident_id === incidentId && t.active === 1) {
        t.active = 0;
        t.revoked_at = ts;
      }
    }
  }
}

export async function upgradeTupleToWriter(incidentId: string, service: string): Promise<void> {
  const tuples = await getActiveTuples(incidentId);
  const exists = tuples.some((t) => t.service === service && t.relation === "writer");
  if (!exists) {
    await addFgaTuple({
      incident_id: incidentId,
      agent: "blastguard",
      relation: "writer",
      service,
    });
  }
}
