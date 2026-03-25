# Devpost Submission

## Project Name
BlastGuard

## Short Description
AI SRE agent with blast-radius-controlled permissions -- task-scoped, time-bound, auto-revoking authorization using Auth0 Token Vault + FGA + CIBA.

## Full Description

### What it does
BlastGuard is an AI-powered incident response agent that investigates and remediates production incidents -- but with a critical difference: its permissions are scoped to the incident, not the agent.

When an incident triggers, BlastGuard:
- Gets **read-only** FGA permissions for only the affected service
- Uses **Token Vault** to exchange scoped GitHub tokens and investigate recent commits/PRs
- Uses **GPT-4o** to diagnose the root cause from real repository data
- Proposes a remediation (e.g., rollback) but **cannot execute it** -- the FGA check denies writer access
- Triggers **CIBA** to request human approval via an async authorization flow
- Only after human approval does FGA upgrade to writer, and the agent executes the fix
- On incident close, **all permissions are automatically revoked** -- blast radius returns to zero

A Break Glass mode exists for critical P1 incidents, bypassing CIBA with enhanced audit logging.

### How we built it
- **Next.js 15** (App Router) for the dashboard and API
- **Auth0 Token Vault** for JIT credential exchange (GitHub, Slack)
- **Auth0 FGA (OpenFGA model)** for ephemeral per-incident permission tuples
- **Auth0 CIBA** for human-in-the-loop approval before destructive actions
- **GPT-4o** for root cause diagnosis correlating real GitHub commit data
- **In-memory store** with full audit trail and permissions snapshots

### The insight: Blast radius as an authorization primitive

Current AI agent authorization is broken: agents get standing permissions that persist 24/7. When something goes wrong (Meta's rogue AI agent, Amazon Q destroying infrastructure), the blast radius is unlimited.

BlastGuard demonstrates that **FGA tuples should be ephemeral** -- created per-task, constrained to affected resources, and auto-deleted on task completion. Token Vault + FGA + CIBA are not alternatives; they're complementary layers that together enable task-scoped, time-bound, human-gated permissions.

This pattern doesn't exist in any authorization model today.

### Challenges
- Auth0 SDK v4 API changes required adapting the middleware and route handlers
- Maintaining state across the async CIBA approval flow
- Making the permission timeline visualization update in real-time

### What we learned
- FGA tuples work beautifully as ephemeral, task-scoped permissions
- The Token Vault + FGA + CIBA combination covers credentials, authorization, and human oversight in one coherent architecture
- The "blast radius" framing makes agent security intuitive for SRE teams

---

## Bonus Blog Post (250+ words)

## Bonus Blog Post

Building BlastGuard taught me something fundamental about AI agent authorization: we've been thinking about it wrong.

The standard approach is to give an agent an identity with permissions, just like a human user. But agents aren't humans. They operate autonomously, make decisions at runtime, and can be compromised or hallucinate. When Meta's AI agent posted without authorization last week and caused a Sev 1, it had standing permissions it should never have had.

The insight I arrived at while building with Auth0's Token Vault is that **permissions should be scoped to the task, not the agent**. In BlastGuard, when a production incident triggers, the system creates FGA tuples granting the agent read-only access to *only* the affected service. These tuples are ephemeral -- they exist for the duration of the incident and are automatically deleted when it closes.

Token Vault handles the credential layer: the agent gets JIT GitHub tokens scoped to the exact permissions needed for investigation. But having credentials isn't enough -- FGA gates whether the agent can actually *use* them at any given moment. And for destructive operations like rollbacks, CIBA adds a human approval layer that pauses the entire workflow until an operator explicitly approves.

The result is what I call "blast radius as an authorization primitive." Even if the agent were compromised, prompt-injected, or hallucinating, the maximum damage it could do is bounded by the incident it's responding to. After the incident closes, the blast radius is zero -- no permissions remain.

This three-layer pattern (Token Vault for credentials, FGA for authorization, CIBA for human gates) doesn't exist in any authorization model today. I believe it should be the default for any AI agent operating in production infrastructure.

---

## Links
- **GitHub:** https://github.com/IstvanCsVarga/blastguard
- **Live demo:** https://blastguard.vercel.app
- **Video:** [TO BE RECORDED]

## Video Script (3 minutes)

**[0:00-0:20] Hook**
"Last week, Meta's AI agent went rogue -- posted without authorization, exposed sensitive data, Sev 1 incident. This happens because AI agents get standing permissions. BlastGuard fixes this with a pattern I call blast-radius-controlled authorization."

**[0:20-0:50] Create incident + show initial permissions**
Show the dashboard. Create a P1 incident for "API Gateway Memory Leak" affecting api-gateway. Point out the Permission Timeline: one reader tuple appears for just the affected service. "The agent has read-only access to one service. Nothing else."

**[0:50-1:20] Agent investigates with Token Vault**
Watch the agent progress through Triage -> Investigate. Point out the audit log: "Token Vault exchanges a scoped GitHub token. The agent fetches real commits and PRs." Show the audit entries appearing in real-time.

**[1:20-1:50] GPT-4o diagnosis**
Agent reaches Diagnose state. "GPT-4o correlates the actual commit history with the incident description." Show the diagnosis appearing with real commit SHAs and author names.

**[1:50-2:20] CIBA approval gate**
Agent proposes rollback. CIBA card appears: "The agent needs writer access but FGA denies it. Look at the audit log -- 'writer permission DENIED.' The agent literally cannot execute the rollback without human approval." Click Approve. Show the FGA tuple upgrading to writer in the Permission Timeline.

**[2:20-2:50] Remediation + auto-revoke**
Agent executes rollback, verifies health, posts to Slack. Then closes. "Watch the Permission Timeline -- all tuples turn red. Revoked. The blast radius is back to zero."

**[2:50-3:00] Closing**
"Blast radius as an authorization primitive. Token Vault for credentials, FGA for authorization, CIBA for human gates. Three layers, working together. BlastGuard."
