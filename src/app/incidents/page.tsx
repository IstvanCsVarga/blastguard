"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Incident } from "@/lib/db";

const severityColors: Record<string, string> = {
  P1: "bg-red-500",
  P2: "bg-orange-500",
  P3: "bg-yellow-500",
  P4: "bg-blue-500",
};

const statusLabels: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "text-zinc-400" },
  triaging: { label: "Triaging", color: "text-amber-400" },
  investigating: { label: "Investigating", color: "text-blue-400" },
  diagnosing: { label: "Diagnosing", color: "text-purple-400" },
  proposing: { label: "Proposing Fix", color: "text-cyan-400" },
  awaiting_approval: { label: "Awaiting Approval", color: "text-yellow-400 animate-pulse" },
  remediating: { label: "Remediating", color: "text-orange-400" },
  verifying: { label: "Verifying", color: "text-green-400" },
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
    const interval = setInterval(loadIncidents, 3000);
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
    <div className="min-h-screen bg-zinc-950 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              Blast<span className="text-red-500">Guard</span>
            </h1>
            <p className="text-zinc-500 text-sm mt-1">Incident Response Dashboard</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-medium transition-colors"
            >
              + New Incident
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/auth/logout"
              className="px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Logout
            </a>
          </div>
        </div>

        {showCreate && (
          <form
            onSubmit={handleCreate}
            className="mb-8 p-6 rounded-lg bg-zinc-900 border border-zinc-800 space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="API Gateway OOMKilling"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Affected Service</label>
                <input
                  type="text"
                  required
                  value={form.affected_service}
                  onChange={(e) => setForm({ ...form, affected_service: e.target.value })}
                  placeholder="api-gateway"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-600"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">Description</label>
              <textarea
                required
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Pods are being OOMKilled after deployment #487..."
                rows={3}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder:text-zinc-600"
              />
            </div>
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Severity</label>
                <select
                  value={form.severity}
                  onChange={(e) => setForm({ ...form, severity: e.target.value })}
                  className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100"
                >
                  <option value="P1">P1 - Critical</option>
                  <option value="P2">P2 - High</option>
                  <option value="P3">P3 - Medium</option>
                  <option value="P4">P4 - Low</option>
                </select>
              </div>
              <div className="flex-1" />
              <button
                type="submit"
                disabled={creating}
                className="px-6 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg text-white font-medium transition-colors"
              >
                {creating ? "Creating..." : "Create & Deploy Agent"}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {incidents.length === 0 && (
            <div className="text-center py-16 text-zinc-600">
              No incidents yet. Create one to deploy the BlastGuard agent.
            </div>
          )}
          {incidents.map((inc) => {
            const status = statusLabels[inc.status] ?? statusLabels.open;
            return (
              <Link
                key={inc.id}
                href={`/incidents/${inc.id}`}
                className="block p-4 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${severityColors[inc.severity] ?? "bg-zinc-500"}`}
                  />
                  <span className="font-mono text-sm text-zinc-500">{inc.id}</span>
                  <span className="font-medium text-zinc-200">{inc.title}</span>
                  <span className="flex-1" />
                  <span className={`text-sm font-medium ${status.color}`}>
                    {status.label}
                  </span>
                  <span className="text-xs text-zinc-600">
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
