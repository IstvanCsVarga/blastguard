import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function diagnoseIncident(
  service: string,
  description: string,
  commits: string[],
  prs: string[]
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    max_tokens: 500,
    messages: [
      {
        role: "system",
        content: `You are an expert SRE AI agent called BlastGuard. You analyze production incidents by correlating evidence from GitHub commits, PRs, and deployment history.
Provide a concise root cause analysis in 2-3 sentences. Be specific about what changed and why it caused the issue. Do not use markdown formatting.`,
      },
      {
        role: "user",
        content: `Incident affecting service: ${service}
Description: ${description}

Recent commits:
${commits.length > 0 ? commits.join("\n") : "No recent commits found"}

Recent PRs:
${prs.length > 0 ? prs.join("\n") : "No recent PRs found"}

Provide a root cause diagnosis.`,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? "Unable to determine root cause.";
}

export async function proposeRemediation(
  service: string,
  diagnosis: string
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    max_tokens: 300,
    messages: [
      {
        role: "system",
        content: `You are an expert SRE AI agent called BlastGuard. Based on a diagnosis, propose a specific remediation action. Be concise (1-2 sentences). The remediation should be a concrete action like "Roll back to deployment X" or "Scale up replicas to Y". Do not use markdown formatting.`,
      },
      {
        role: "user",
        content: `Service: ${service}
Diagnosis: ${diagnosis}

Propose a specific remediation action.`,
      },
    ],
  });

  return response.choices[0]?.message?.content ?? "Roll back to the previous stable deployment.";
}
