import { Annotation } from "@langchain/langgraph";

/**
 * BlastGuard agent state schema.
 * Tracks the incident through the response lifecycle.
 */
export const AgentState = Annotation.Root({
  // Incident metadata
  incidentId: Annotation<string>,
  title: Annotation<string>,
  description: Annotation<string>,
  severity: Annotation<string>,
  service: Annotation<string>,

  // Agent progress
  phase: Annotation<string>({ reducer: (_, next) => next, default: () => "open" }),

  // Investigation data
  commits: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),
  prs: Annotation<string[]>({ reducer: (_, next) => next, default: () => [] }),

  // LLM outputs
  diagnosis: Annotation<string>({ reducer: (_, next) => next, default: () => "" }),
  remediationPlan: Annotation<string>({ reducer: (_, next) => next, default: () => "" }),

  // Authorization state
  breakGlass: Annotation<boolean>({ reducer: (_, next) => next, default: () => false }),
  approved: Annotation<boolean>({ reducer: (_, next) => next, default: () => false }),

  // Operator context (for CIBA)
  operatorId: Annotation<string>({ reducer: (_, next) => next, default: () => "" }),

  // Token Vault pre-exchanged GitHub token (fallback if in-graph exchange fails)
  githubToken: Annotation<string>({ reducer: (_, next) => next, default: () => "" }),
});

export type AgentStateType = typeof AgentState.State;
