import "dotenv/config";
import express from "express";

const app = express();

const PORT = Number(process.env.PORT ?? 3000);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API_URL =
  process.env.GITHUB_API_URL ?? "https://api.github.com";
const TIMEZONE = process.env.TIMEZONE ?? "Europe/London";

type GitHubRepository = {
  full_name: string;
  default_branch: string;
};

type GitHubCommit = {
  commit: {
    author: {
      date: string;
    } | null;
  };
};

type GitHubError = {
  message?: string;
};

class GitHubRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubRequestError";
    this.status = status;
  }
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIMEZONE,
    timeZoneName: "short",
  }).format(date);
}

async function github<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  const response = await fetch(`${GITHUB_API_URL}${path}`, { headers });

  if (response.ok) {
    return response.json() as Promise<T>;
  }

  let message = `GitHub API returned ${response.status}`;

  try {
    const body = (await response.json()) as GitHubError;

    if (body.message) {
      message += `: ${body.message}`;
    }
  } catch {
    // GitHub did not return JSON
  }

  throw new GitHubRequestError(response.status, message);
}

function repoPath(owner: string, repo: string): string {
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

async function getRepository(
  owner: string,
  repo: string
): Promise<GitHubRepository> {
  return github<GitHubRepository>(repoPath(owner, repo));
}

async function getBranchCommit(
  owner: string,
  repo: string,
  branch: string
): Promise<GitHubCommit> {
  return github<GitHubCommit>(
    `${repoPath(owner, repo)}/commits/${encodeURIComponent(branch)}`
  );
}

app.get("/github/:owner/:repo", async (req, res) => {
  const { owner, repo } = req.params;

  try {
    const repository = await getRepository(owner, repo);
    const branch = repository.default_branch;
    const commit = await getBranchCommit(owner, repo, branch);

    return res.json({
      repository: repository.full_name,
      branch,
      commitDate: formatDate(commit.commit.author?.date),
    });
  } catch (error) {
    console.error("GitBeacon error:", error);

    if (error instanceof GitHubRequestError) {
      return res.status(error.status).json({
        error: error.message,
      });
    }

    return res.status(500).json({
      error: "Failed to retrieve repository information.",
    });
  }
});

app.get("/health", (_req, res) => {
  return res.json({
    status: "ok",
  });
});

app.listen(PORT, () => {
  console.log(`GitBeacon running on http://localhost:${PORT}`);

  console.log(
    GITHUB_TOKEN
      ? "GitHub authentication: PAT configured"
      : "GitHub authentication: none (public repositories only)"
  );

  console.log(`Timezone: ${TIMEZONE}`);
});
