const GITHUB_API = "https://api.github.com";

export type CommitInfo = {
  sha: string;
  message: string;
  author: string;
  date: string;
};

export type PRInfo = {
  number: number;
  title: string;
  author: string;
  merged_at: string | null;
  state: string;
};

export async function fetchRecentCommits(
  owner: string,
  repo: string,
  maxCount = 10,
  token?: string
): Promise<CommitInfo[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const url = `${GITHUB_API}/repos/${owner}/${repo}/commits?since=${since}&per_page=${maxCount}`;

  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    console.error(`GitHub commits API error: ${res.status}`);
    return [];
  }

  const data = await res.json();
  return data.map((c: Record<string, unknown>) => {
    const commit = c.commit as Record<string, unknown>;
    const author = commit.author as Record<string, string>;
    return {
      sha: (c.sha as string).slice(0, 7),
      message: (commit.message as string).split("\n")[0],
      author: author?.name ?? "unknown",
      date: author?.date ?? "",
    };
  });
}

export async function fetchRecentPRs(
  owner: string,
  repo: string,
  maxCount = 10,
  token?: string
): Promise<PRInfo[]> {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=${maxCount}`;

  const headers: Record<string, string> = { Accept: "application/vnd.github.v3+json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { headers });

  if (!res.ok) {
    console.error(`GitHub PRs API error: ${res.status}`);
    return [];
  }

  const data = await res.json();
  return data.map((pr: Record<string, unknown>) => {
    const user = pr.user as Record<string, string>;
    return {
      number: pr.number as number,
      title: pr.title as string,
      author: user?.login ?? "unknown",
      merged_at: (pr.merged_at as string) ?? null,
      state: pr.state as string,
    };
  });
}

export function formatCommitsForLLM(commits: CommitInfo[]): string[] {
  return commits.map(
    (c) => `[${c.sha}] ${c.date} by ${c.author}: ${c.message}`
  );
}

export function formatPRsForLLM(prs: PRInfo[]): string[] {
  return prs.map(
    (pr) =>
      `PR #${pr.number} (${pr.state}${pr.merged_at ? ", merged" : ""}): ${pr.title} by ${pr.author}`
  );
}
