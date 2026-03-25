import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-amber-500/5 rounded-full blur-3xl" />

        <div className="max-w-3xl text-center space-y-10 relative z-10">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium tracking-wide">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              AI Incident Response
            </div>
            <h1 className="text-6xl sm:text-7xl font-bold tracking-tight leading-none">
              Blast<span className="text-red-500">Guard</span>
            </h1>
            <p className="text-zinc-400 text-xl max-w-xl mx-auto leading-relaxed">
              AI SRE agent with blast-radius-controlled permissions.
              <br />
              <span className="text-zinc-500">Task-scoped. Time-bound. Auto-revoking.</span>
            </p>
          </div>

          {/* Architecture diagram */}
          <div className="flex items-center justify-center gap-3 text-sm">
            <div className="px-5 py-3 rounded-xl bg-gradient-to-b from-amber-500/10 to-amber-500/5 border border-amber-500/20">
              <div className="text-amber-400 font-bold text-base">Token Vault</div>
              <div className="text-zinc-500 mt-0.5">JIT credentials</div>
            </div>
            <div className="text-zinc-700 text-lg">+</div>
            <div className="px-5 py-3 rounded-xl bg-gradient-to-b from-blue-500/10 to-blue-500/5 border border-blue-500/20">
              <div className="text-blue-400 font-bold text-base">FGA</div>
              <div className="text-zinc-500 mt-0.5">Ephemeral permissions</div>
            </div>
            <div className="text-zinc-700 text-lg">+</div>
            <div className="px-5 py-3 rounded-xl bg-gradient-to-b from-green-500/10 to-green-500/5 border border-green-500/20">
              <div className="text-green-400 font-bold text-base">CIBA</div>
              <div className="text-zinc-500 mt-0.5">Human approval gate</div>
            </div>
          </div>

          {/* CTA */}
          <div className="flex gap-4 justify-center">
            <a
              href="/auth/login?returnTo=/incidents"
              className="px-8 py-3.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition-all shadow-lg shadow-red-500/20 hover:shadow-red-500/30"
            >
              Sign In to Dashboard
            </a>
            <Link
              href="/incidents"
              className="px-8 py-3.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-200 font-semibold transition-all border border-zinc-700/50"
            >
              View Incidents
            </Link>
          </div>

          <p className="text-zinc-600 text-xs tracking-wide">
            Built for the Auth0 &ldquo;Authorized to Act&rdquo; Hackathon &middot; Token Vault + FGA + CIBA &middot; GPT-4o &middot; Next.js
          </p>
        </div>
      </div>
    </div>
  );
}
