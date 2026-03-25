"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import type { Incident, AuditEntry, FgaTuple } from "@/lib/db";

const AGENT_STATES = [
  "open",
  "triaging",
  "investigating",
  "diagnosing",
  "proposing",
  "awaiting_approval",
  "remediating",
  "verifying",
  "closed",
] as const;

const stateLabels: Record<string, string> = {
  open: "Open",
  triaging: "Triage",
  investigating: "Investigate",
  diagnosing: "Diagnose",
  proposing: "Propose",
  awaiting_approval: "Approval",
  remediating: "Remediate",
  verifying: "Verify",
  closed: "Closed",
};

const eventTypeIcons: Record<string, string> = {
  incident_created: "🔴",
  permission_granted: "🔓",
  permission_revoked: "🔒",
  permission_upgraded: "⬆️",
  agent_action: "🤖",
  human_approval: "👤",
  break_glass: "🚨",
  incident_closed: "✅",
};

type IncidentDetail = {
  incident: Incident;
  auditLog: AuditEntry[];
  tuples: FgaTuple[];
};

export default function IncidentDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<IncidentDetail | null>(null);
  const [runningAgent, setRunningAgent] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/incidents/${id}`);
    if (res.ok) setData(await res.json());
  }, [id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 2000);
    return () => clearInterval(interval);
  }, [load]);

  async function runAgent() {
    setRunningAgent(true);
    await fetch(`/api/incidents/${id}/stream`, { method: "POST" });
    setRunningAgent(false);
    load();
  }

  async function handleApprove() {
    await fetch(`/api/incidents/${id}/approve`, { method: "POST" });
    load();
  }

  async function handleBreakGlass() {
    if (!confirm("Activate Break Glass mode? This bypasses CIBA approval with enhanced logging.")) return;
    await fetch(`/api/incidents/${id}/breakglass`, { method: "POST" });
    load();
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">
        Loading...
      </div>
    );
  }

  const { incident, auditLog, tuples } = data;
  const activeTuples = tuples.filter((t) => t.active);
  const stateIdx = AGENT_STATES.indexOf(incident.status as typeof AGENT_STATES[number]);

  return (
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <a href="/incidents" className="text-zinc-500 hover:text-zinc-300">&larr;</a>
          <div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-zinc-500">{incident.id}</span>
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400">
                {incident.severity}
              </span>
              {incident.break_glass ? (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400 animate-pulse">
                  BREAK GLASS
                </span>
              ) : null}
            </div>
            <h1 className="text-2xl font-bold mt-1">{incident.title}</h1>
            <p className="text-zinc-500 text-sm">{incident.affected_service} &middot; {incident.created_at}</p>
          </div>
          <div className="flex-1" />
          {incident.status === "open" && (
            <button
              onClick={runAgent}
              disabled={runningAgent}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-white font-medium"
            >
              {runningAgent ? "Agent Running..." : "Deploy Agent"}
            </button>
          )}
          {incident.status !== "closed" && !incident.break_glass && (
            <button
              onClick={handleBreakGlass}
              className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-600/40 rounded-lg text-amber-400 font-medium text-sm"
            >
              Break Glass
            </button>
          )}
        </div>

        {/* Agent State Machine */}
        <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-400 mb-3">Agent State</h2>
          <div className="flex items-center gap-1">
            {AGENT_STATES.map((state, i) => {
              const isActive = i === stateIdx;
              const isPast = i < stateIdx;
              const isFuture = i > stateIdx;
              return (
                <div key={state} className="flex items-center gap-1 flex-1">
                  <div
                    className={`flex-1 py-2 px-2 rounded text-center text-xs font-medium transition-all ${
                      isActive
                        ? "bg-red-500/20 text-red-400 border border-red-500/40 ring-1 ring-red-500/20"
                        : isPast
                          ? "bg-green-500/10 text-green-500/60 border border-green-500/20"
                          : isFuture
                            ? "bg-zinc-800/50 text-zinc-600 border border-zinc-800"
                            : ""
                    }`}
                  >
                    {stateLabels[state]}
                  </div>
                  {i < AGENT_STATES.length - 1 && (
                    <span className={`text-xs ${isPast ? "text-green-500/40" : "text-zinc-700"}`}>→</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CIBA Approval Card */}
        {incident.status === "awaiting_approval" && (
          <div className="p-6 rounded-lg bg-yellow-500/5 border border-yellow-500/30 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-lg font-semibold text-yellow-400">Human Approval Required</h2>
            </div>
            <p className="text-zinc-300">
              The agent proposes: <strong>{incident.remediation_plan}</strong>
            </p>
            <p className="text-zinc-500 text-sm">
              This is a destructive operation. Approving will upgrade the agent&apos;s FGA permissions
              from <code className="bg-zinc-800 px-1 rounded">reader</code> to{" "}
              <code className="bg-zinc-800 px-1 rounded">writer</code> for service{" "}
              <strong>{incident.affected_service}</strong>.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleApprove}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-white font-medium"
              >
                Approve Remediation
              </button>
              <button className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 font-medium">
                Deny
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          {/* Permission Timeline */}
          <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-400 mb-3">
              Permission Timeline
              <span className="ml-2 text-xs text-zinc-600">
                {activeTuples.length} active
              </span>
            </h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {tuples.length === 0 && (
                <p className="text-zinc-600 text-sm">No permissions yet</p>
              )}
              {tuples.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 text-sm p-2 rounded ${
                    t.active
                      ? "bg-green-500/5 border border-green-500/20"
                      : "bg-zinc-800/50 border border-zinc-800 opacity-50"
                  }`}
                >
                  <span className={t.active ? "text-green-400" : "text-red-400"}>
                    {t.active ? "●" : "○"}
                  </span>
                  <span className="font-mono text-zinc-400">{t.agent}</span>
                  <span className="text-zinc-600">→</span>
                  <span
                    className={`font-medium ${
                      t.relation === "writer" ? "text-amber-400" : "text-blue-400"
                    }`}
                  >
                    {t.relation}
                  </span>
                  <span className="text-zinc-600">→</span>
                  <span className="text-zinc-300">{t.service}</span>
                  <span className="flex-1" />
                  {!t.active && (
                    <span className="text-xs text-red-400/60">revoked</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Audit Log */}
          <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <h2 className="text-sm font-semibold text-zinc-400 mb-3">Audit Log</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {auditLog.length === 0 && (
                <p className="text-zinc-600 text-sm">No events yet</p>
              )}
              {auditLog.map((entry) => (
                <div
                  key={entry.id}
                  className="text-sm p-2 rounded bg-zinc-800/50 border border-zinc-800"
                >
                  <div className="flex items-center gap-2">
                    <span>{eventTypeIcons[entry.event_type] ?? "📋"}</span>
                    <span className="font-medium text-zinc-300">{entry.action}</span>
                  </div>
                  {entry.details && (
                    <p className="text-zinc-500 text-xs mt-1 ml-6">{entry.details}</p>
                  )}
                  <div className="flex items-center gap-2 mt-1 ml-6">
                    <span className="text-xs text-zinc-600">{entry.actor}</span>
                    <span className="text-xs text-zinc-700">{entry.created_at}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Diagnosis & Remediation */}
        {(incident.diagnosis || incident.remediation_plan) && (
          <div className="grid grid-cols-2 gap-6">
            {incident.diagnosis && (
              <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-400 mb-2">Diagnosis</h2>
                <p className="text-zinc-300 text-sm whitespace-pre-wrap">{incident.diagnosis}</p>
              </div>
            )}
            {incident.remediation_plan && (
              <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
                <h2 className="text-sm font-semibold text-zinc-400 mb-2">Remediation Plan</h2>
                <p className="text-zinc-300 text-sm whitespace-pre-wrap">{incident.remediation_plan}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
