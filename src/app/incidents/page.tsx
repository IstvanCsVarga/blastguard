"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Incident } from "@/lib/db";

const severityStyle: Record<string, string> = {
  P1: "bg-red-500/20 text-red-400 border-red-500/20",
  P2: "bg-orange-500/20 text-orange-400 border-orange-500/20",
  P3: "bg-yellow-500/20 text-yellow-400 border-yellow-500/20",
  P4: "bg-blue-500/20 text-blue-400 border-blue-500/20",
};

const statusConfig: Record<string, { label: string; color: string; pulse?: boolean }> = {
  open: { label: "Open", color: "text-zinc-400" },
  triaging: { label: "Triaging", color: "text-amber-400", pulse: true },
  investigating: { label: "Investigating", color: "text-blue-400", pulse: true },
  diagnosing: { label: "Diagnosing", color: "text-purple-400", pulse: true },
  proposing: { label: "Proposing", color: "text-cyan-400", pulse: true },
  awaiting_approval: { label: "Awaiting Approval", color: "text-yellow-400", pulse: true },
  remediating: { label: "Remediating", color: "text-orange-400", pulse: true },
  verifying: { label: "Verifying", color: "text-green-400", pulse: true },
  closed: { label: "Closed", color: "text-zinc-500" },
};

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    severity: "P2",
    affected_service: "",
  });
  const [creating, setCreating] = useState(false);

  async function loadIncidents() {
    const res = await fetch("/api/incidents");
    const data = await res.json();
    setIncidents(data);
  }

  useEffect(() => {
    loadIncidents();
    const interval = setInterval(loadIncidents, 2000);
    return () => clearInterval(interval);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    await fetch("/api/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ title: "", description: "", severity: "P2", affected_service: "" });
    setShowCreate(false);
    setCreating(false);
    loadIncidents();
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <Link href="/" className="text-2xl font-bold">
              Blast<span className="text-red-500">Guard</span>
            </Link>
            <p className="text-zinc-600 text-xs mt-0.5">Incident Response Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="px-5 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-white font-semibold text-sm transition-all shadow-lg shadow-red-500/20"
            >
              + New Incident
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/auth/logout" className="px-3 py-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
              Logout
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="mb-6 p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800/50 space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Title</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="API Gateway OOMKilling"
                  className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/30 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Affected Service</label>
                <input
                  type="text"
                  required
                  value={form.affected_service}
                  onChange={(e) => setForm({ ...form, affected_service: e.target.value })}
                  placeholder="api-gateway"
                  className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/30 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Description</label>
              <textarea
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Pods are being OOMKilled after deployment #487..."
                rows={3}
                className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/30 transition-all resize-none"
              />
            </div>
            <div className="flex items-end gap-4">
              <div>
                <label className="block text-xs text-zinc-500 uppercase tracking-wider mb-1.5">Severity</label>
                <select
                  value={form.severity}
                  onChange={(e) => setForm({ ...form, severity: e.target.value })}
                  className="px-4 py-2.5 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-zinc-100 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                >
                  <option value="P1">P1 — Critical</option>
                  <option value="P2">P2 — High</option>
                  <option value="P3">P3 — Medium</option>
                  <option value="P4">P4 — Low</option>
                </select>
              </div>
              <div className="flex-1" />
              <button
                type="submit"
                disabled={creating}
                className="px-6 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-xl text-white font-semibold text-sm transition-all shadow-lg shadow-red-500/20"
              >
                {creating ? "Creating..." : "Create & Deploy Agent"}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {incidents.length === 0 && (
            <div className="text-center py-20">
              <div className="text-zinc-700 text-5xl mb-4">○</div>
              <div className="text-zinc-600 text-sm">No incidents. Create one to deploy the BlastGuard agent.</div>
            </div>
          )}
          {incidents.map((inc) => {
            const status = statusConfig[inc.status] ?? statusConfig.open;
            return (
              <Link
                key={inc.id}
                href={`/incidents/${inc.id}`}
                className="block p-4 rounded-xl bg-zinc-900/30 border border-zinc-800/50 hover:bg-zinc-900/60 hover:border-zinc-700/50 transition-all group"
              >
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${severityStyle[inc.severity] ?? "bg-zinc-500/20 text-zinc-400 border-zinc-500/20"}`}>
                    {inc.severity}
                  </span>
                  <span className="font-mono text-xs text-zinc-600">{inc.id}</span>
                  <span className="font-medium text-zinc-200 group-hover:text-white transition-colors">{inc.title}</span>
                  <span className="flex-1" />
                  <span className={`text-xs font-medium flex items-center gap-1.5 ${status.color}`}>
                    {status.pulse && (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
                      </span>
                    )}
                    {status.label}
                  </span>
                  <span className="text-[10px] text-zinc-700 font-mono bg-zinc-800/50 px-2 py-0.5 rounded">
                    {inc.affected_service}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
