# BlastGuard

**Blast-radius-controlled AI incident response agent.**

An AI SRE agent that responds to production incidents with dynamically scoped, time-bound, auto-revoking permissions. Built for the [Auth0 "Authorized to Act"](https://authorizedtoact.devpost.com/) hackathon.

## The Problem

Recent incidents (Meta's rogue AI agent Sev1, Amazon Q destroying infrastructure, Replit deleting production data) prove that AI agents with broad standing permissions are dangerous. 97% of AI breaches stem from access control failures, not authentication.

## The Solution

BlastGuard scopes permissions to the **task** (incident), not the **agent**:

```
Token Vault  -->  CREDENTIALS   (what tokens does the agent have?)
     +
FGA (OpenFGA) -->  AUTHORIZATION (is the agent allowed to use them right now?)
     +
CIBA          -->  HUMAN GATE   (has a human approved this specific action?)
```

### How It Works

1. **Incident triggers** -- operator creates incident
2. **JIT permission grant** -- FGA tuples created scoping agent to ONLY affected services (read-only)
3. **Investigate** -- agent uses Token Vault GitHub connection to pull recent commits, PRs, deployments
4. **Diagnose** -- GPT-4o analyzes gathered evidence, produces root cause
5. **Propose remediation** -- agent suggests fix (e.g., rollback deployment)
6. **CIBA human approval** -- operator must approve before any destructive action
7. **Permission escalation** -- on approval, FGA upgraded from `reader` to `writer`
8. **Remediate** -- agent executes approved action via GitHub API
9. **Verify + notify** -- agent checks health, posts to Slack via Token Vault
10. **Close + auto-revoke** -- ALL FGA tuples deleted. Blast radius is zero.

### Break Glass Mode

For P1/Sev1 incidents, operators can activate Break Glass to bypass CIBA approval with enhanced audit logging and a mandatory post-incident review flag.

## The Insight

**"Blast radius as an authorization primitive"** -- FGA tuples are ephemeral, created per-incident and auto-deleted on close. This means even a compromised or hallucinating agent cannot exceed the blast radius of the incident it's responding to.

Token Vault + FGA + CIBA are complementary, not alternatives. Together they enable task-scoped, time-bound, human-gated permissions that don't exist in any other authorization model today.

## Tech Stack

- **Next.js 15** (App Router) -- dashboard + API
- **Auth0 Token Vault** -- JIT credential exchange for GitHub & Slack
- **Auth0 FGA (OpenFGA)** -- ephemeral per-incident permission tuples
- **Auth0 CIBA** -- human-in-the-loop approval for destructive actions
- **GPT-4o** -- incident diagnosis and remediation proposal
- **SQLite** -- audit log and FGA tuple tracking
- **Tailwind CSS** -- dark-mode SRE dashboard

## Getting Started

```bash
# Install dependencies (requires Node >= 20)
npm install

# Set up environment variables
cp .env.example .env.local
# Fill in Auth0, OpenAI, and OpenFGA credentials

# Run development server
npm run dev
```

Open http://localhost:3000

## Project Structure

```
src/
  app/
    page.tsx                    # Landing page
    incidents/page.tsx          # Incident list dashboard
    incidents/[id]/page.tsx     # Incident detail with agent viz
    api/incidents/              # CRUD + agent workflow endpoints
    api/auth/[auth0]/           # Auth0 authentication
  lib/
    auth0.ts                    # Auth0 client
    db.ts                       # SQLite schema + queries
    audit.ts                    # Audit logging with permissions snapshot
    agent-workflow.ts           # Agent state machine
    github.ts                   # GitHub API integration
    llm.ts                      # GPT-4o diagnosis + remediation
  middleware.ts                 # Auth0 session protection
```

## License

MIT
