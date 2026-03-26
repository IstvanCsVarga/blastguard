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
  const [githubStatus, setGithubStatus] = useState<{
    connected: boolean;
    provider: string | null;
    nickname: string | null;
  } | null>(null);

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

  useEffect(() => {
    fetch("/api/auth/github-status")
      .then((r) => r.json())
      .then(setGithubStatus)
      .catch(() => setGithubStatus({ connected: false, provider: null, nickname: null }));
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
            {githubStatus && !githubStatus.connected && (
              // eslint-disable-next-line @next/next/no-html-link-for-pages
              <a
                href="/auth/connect?connection=github&returnTo=/incidents"
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-700/50 bg-zinc-800/50 hover:bg-zinc-700/50 transition-all text-sm"
              >
                <svg className="w-4 h-4 text-zinc-300" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                <span className="text-zinc-300">Connect GitHub</span>
                <span className="text-[10px] text-zinc-500">for Token Vault</span>
              </a>
            )}
            {githubStatus?.connected && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                <svg className="w-4 h-4 text-green-400" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
                <span className="text-xs text-green-400 font-medium">GitHub Connected</span>
                {githubStatus.nickname && (
                  <span className="text-[10px] text-green-500/60">@{githubStatus.nickname}</span>
                )}
              </div>
            )}
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
