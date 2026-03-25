"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Incident, AuditEntry, FgaTuple } from "@/lib/db";

const AGENT_STATES = [
  "open", "triaging", "investigating", "diagnosing",
  "proposing", "awaiting_approval", "remediating", "verifying", "closed",
] as const;

const stateConfig: Record<string, { label: string; icon: string; color: string }> = {
  open: { label: "Open", icon: "○", color: "zinc" },
  triaging: { label: "Triage", icon: "◈", color: "amber" },
  investigating: { label: "Investigate", icon: "◉", color: "blue" },
  diagnosing: { label: "Diagnose", icon: "◎", color: "purple" },
  proposing: { label: "Propose", icon: "◇", color: "cyan" },
  awaiting_approval: { label: "Approval", icon: "⏸", color: "yellow" },
  remediating: { label: "Remediate", icon: "▶", color: "orange" },
  verifying: { label: "Verify", icon: "✓", color: "green" },
  closed: { label: "Closed", icon: "●", color: "zinc" },
};

const eventIcons: Record<string, string> = {
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
  const auditEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/incidents/${id}`);
    if (res.ok) setData(await res.json());
  }, [id]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 1500);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    auditEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.auditLog.length]);

  async function runAgent() {
    setRunningAgent(true);
    await fetch(`/api/incidents/${id}/stream`, { method: "POST" });
    setRunningAgent(false);
  }

  async function handleApprove() {
    await fetch(`/api/incidents/${id}/approve`, { method: "POST" });
    load();
  }

  async function handleBreakGlass() {
    if (!confirm("Activate Break Glass? This bypasses CIBA with enhanced logging.")) return;
    await fetch(`/api/incidents/${id}/breakglass`, { method: "POST" });
    load();
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { incident, auditLog, tuples } = data;
  const activeTuples = tuples.filter((t) => t.active);
  const stateIdx = AGENT_STATES.indexOf(incident.status as typeof AGENT_STATES[number]);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-4">
          <Link href="/incidents" className="text-zinc-500 hover:text-zinc-300 transition-colors text-lg">
            &larr;
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-zinc-600 bg-zinc-800/50 px-2 py-0.5 rounded">{incident.id}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                incident.severity === "P1" ? "bg-red-500/20 text-red-400" :
                incident.severity === "P2" ? "bg-orange-500/20 text-orange-400" :
                "bg-yellow-500/20 text-yellow-400"
              }`}>{incident.severity}</span>
              {incident.break_glass ? (
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400 animate-pulse">
                  BREAK GLASS
                </span>
              ) : null}
            </div>
            <h1 className="text-xl font-bold mt-1 truncate">{incident.title}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {incident.status === "open" && (
              <button
                onClick={runAgent}
                disabled={runningAgent}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg text-white font-semibold text-sm transition-all shadow-lg shadow-red-500/20"
              >
                {runningAgent ? "Deploying..." : "Deploy Agent"}
              </button>
            )}
            {incident.status !== "closed" && !incident.break_glass && (
              <button
                onClick={handleBreakGlass}
                className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-amber-400 font-medium text-sm transition-all"
              >
                Break Glass
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* State Machine */}
        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Agent State Machine</div>
          <div className="flex items-center">
            {AGENT_STATES.map((state, i) => {
              const isActive = i === stateIdx;
              const isPast = i < stateIdx;
              const cfg = stateConfig[state];
              return (
                <div key={state} className="flex items-center flex-1">
                  <div className={`flex-1 text-center transition-all duration-500 ${
                    isActive
                      ? "scale-105"
                      : ""
                  }`}>
                    <div className={`mx-auto w-10 h-10 rounded-full flex items-center justify-center text-sm mb-1.5 transition-all duration-500 ${
                      isActive
                        ? `bg-${cfg.color}-500/20 text-${cfg.color}-400 ring-2 ring-${cfg.color}-500/40 shadow-lg shadow-${cfg.color}-500/10`
                        : isPast
                          ? "bg-green-500/10 text-green-500/70 ring-1 ring-green-500/20"
                          : "bg-zinc-800/50 text-zinc-700 ring-1 ring-zinc-800"
                    }`}>
                      {isPast ? "✓" : cfg.icon}
                    </div>
                    <div className={`text-[10px] font-medium transition-all duration-500 ${
                      isActive ? `text-${cfg.color}-400` : isPast ? "text-green-500/50" : "text-zinc-700"
                    }`}>
                      {cfg.label}
                    </div>
                  </div>
                  {i < AGENT_STATES.length - 1 && (
                    <div className={`w-full h-px mx-0.5 transition-all duration-500 ${
                      isPast ? "bg-green-500/30" : "bg-zinc-800"
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* CIBA Approval Card */}
        {incident.status === "awaiting_approval" && (
          <div className="p-6 rounded-2xl bg-gradient-to-r from-yellow-500/5 to-amber-500/5 border border-yellow-500/20 animate-pulse-slow">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center text-2xl shrink-0">
                ⚠️
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <h2 className="text-lg font-bold text-yellow-400">CIBA: Human Approval Required</h2>
                  <p className="text-zinc-400 text-sm mt-1">
                    The agent requires <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-xs">writer</code> access
                    to <strong className="text-zinc-300">{incident.affected_service}</strong>.
                    This destructive operation needs your explicit approval.
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                  <div className="text-xs text-zinc-500 mb-1">Proposed Action</div>
                  <div className="text-zinc-200 text-sm">{incident.remediation_plan}</div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleApprove}
                    className="px-6 py-2.5 bg-green-600 hover:bg-green-500 rounded-lg text-white font-semibold text-sm transition-all shadow-lg shadow-green-500/20"
                  >
                    Approve Remediation
                  </button>
                  <button className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-400 font-medium text-sm transition-all">
                    Deny
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-5 gap-6">
          {/* Permission Timeline - 2 cols */}
          <div className="col-span-2 space-y-4">
            <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">FGA Permission Timeline</div>
                <div className={`text-xs font-mono px-2 py-0.5 rounded-full ${
                  activeTuples.length > 0
                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                    : "bg-zinc-800 text-zinc-600 border border-zinc-700"
                }`}>
                  {activeTuples.length} active
                </div>
              </div>
              <div className="space-y-2">
                {tuples.length === 0 && (
                  <div className="text-center py-8 text-zinc-700 text-sm">No permissions granted yet</div>
                )}
                {tuples.map((t) => (
                  <div
                    key={t.id}
                    className={`p-3 rounded-xl transition-all duration-300 ${
                      t.active
                        ? "bg-green-500/5 border border-green-500/20"
                        : "bg-zinc-800/30 border border-zinc-800/50 opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full transition-all ${
                        t.active ? "bg-green-400 shadow-sm shadow-green-400/50" : "bg-red-400/50"
                      }`} />
                      <span className="font-mono text-xs text-zinc-500">{t.agent}</span>
                      <span className="text-zinc-700">→</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        t.relation === "writer"
                          ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      }`}>
                        {t.relation}
                      </span>
                      <span className="text-zinc-700">→</span>
                      <span className="text-zinc-300 text-sm font-medium">{t.service}</span>
                    </div>
                    {!t.active && (
                      <div className="mt-1.5 ml-4 text-[10px] text-red-400/60 flex items-center gap-1">
                        <span>🔒</span> Revoked at {t.revoked_at?.split("T")[1]?.split(".")[0]}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Blast Radius Indicator */}
              <div className={`mt-4 p-3 rounded-xl text-center text-xs font-medium transition-all ${
                incident.status === "closed"
                  ? "bg-green-500/5 border border-green-500/20 text-green-400"
                  : activeTuples.length > 0
                    ? "bg-amber-500/5 border border-amber-500/20 text-amber-400"
                    : "bg-zinc-800/50 border border-zinc-800 text-zinc-600"
              }`}>
                Blast Radius: {
                  incident.status === "closed"
                    ? "ZERO — all permissions revoked"
                    : activeTuples.length > 0
                      ? `${activeTuples.length} active permission${activeTuples.length > 1 ? "s" : ""}`
                      : "No active permissions"
                }
              </div>
            </div>

            {/* Diagnosis + Remediation */}
            {incident.diagnosis && (
              <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Diagnosis</div>
                <p className="text-zinc-300 text-sm leading-relaxed">{incident.diagnosis}</p>
              </div>
            )}
            {incident.remediation_plan && incident.status !== "awaiting_approval" && (
              <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Remediation</div>
                <p className="text-zinc-300 text-sm leading-relaxed">{incident.remediation_plan}</p>
              </div>
            )}
          </div>

          {/* Audit Log - 3 cols */}
          <div className="col-span-3 p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/50">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Audit Trail</div>
              <div className="text-xs font-mono text-zinc-700">{auditLog.length} events</div>
            </div>
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1 scrollbar-thin">
              {auditLog.length === 0 && (
                <div className="text-center py-8 text-zinc-700 text-sm">No events yet</div>
              )}
              {auditLog.map((entry, i) => (
                <div
                  key={entry.id}
                  className={`p-2.5 rounded-lg transition-all duration-300 ${
                    i === auditLog.length - 1 ? "bg-zinc-800/80 border border-zinc-700/50" : "bg-zinc-800/30 hover:bg-zinc-800/50"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm mt-0.5 shrink-0">{eventIcons[entry.event_type] ?? "📋"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-300 leading-snug">{entry.action}</div>
                      {entry.details && (
                        <div className="text-xs text-zinc-600 mt-0.5 truncate">{entry.details}</div>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          entry.actor === "blastguard"
                            ? "bg-blue-500/10 text-blue-400/70"
                            : entry.actor === "system"
                              ? "bg-zinc-700/50 text-zinc-500"
                              : "bg-green-500/10 text-green-400/70"
                        }`}>{entry.actor}</span>
                        <span className="text-[10px] text-zinc-700 font-mono">
                          {entry.created_at.split("T")[1]?.split(".")[0]}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={auditEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
