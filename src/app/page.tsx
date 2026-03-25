import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-8">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Incident Response
          </div>
          <h1 className="text-5xl font-bold tracking-tight">
            Blast<span className="text-red-500">Guard</span>
          </h1>
          <p className="text-zinc-400 text-lg">
            AI SRE agent with blast-radius-controlled permissions.
            <br />
            Task-scoped. Time-bound. Auto-revoking.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="text-amber-400 font-semibold mb-1">Token Vault</div>
            <div className="text-zinc-500">JIT credentials for GitHub & Slack</div>
          </div>
          <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="text-blue-400 font-semibold mb-1">FGA</div>
            <div className="text-zinc-500">Ephemeral per-incident permissions</div>
          </div>
          <div className="p-4 rounded-lg bg-zinc-900 border border-zinc-800">
            <div className="text-green-400 font-semibold mb-1">CIBA</div>
            <div className="text-zinc-500">Human approval for destructive ops</div>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <a
            href="/auth/login"
            className="px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
          >
            Sign In to Dashboard
          </a>
          <Link
            href="/incidents"
            className="px-6 py-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium transition-colors border border-zinc-700"
          >
            View Demo
          </Link>
        </div>

        <p className="text-zinc-600 text-xs">
          Built with Auth0 Token Vault + FGA + CIBA &middot; LangGraph &middot; Next.js
        </p>
      </div>
    </div>
  );
}
