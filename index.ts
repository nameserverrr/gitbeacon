import "dotenv/config";
import express from "express";

const app = express();

const PORT = Number(process.env.PORT ?? 3000);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API_URL =
  process.env.GITHUB_API_URL ?? "https://api.github.com";

type GitHubRepository = {
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
};

type GitHubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    } | null;
    committer: {
      name: string;
      email: string;
      date: string;
    } | null;
  };
  author: {
    login: string;
    avatar_url: string;
    html_url: string;
  } | null;
};

type GitHubFile = {
  content?: string;
  encoding?: string;
};

type GitHubError = {
  message?: string;
  documentation_url?: string;
};

class GitHubRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubRequestError";
    this.status = status;
  }
}

async function github<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    headers,
  });

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

async function getRepository(
  owner: string,
  repo: string
): Promise<GitHubRepository> {
  const path =
    `/repos/${encodeURIComponent(owner)}` +
    `/${encodeURIComponent(repo)}`;

  return github<GitHubRepository>(path);
}

async function getBranchCommit(
  owner: string,
  repo: string,
  branch: string
): Promise<GitHubCommit> {
  const path =
    `/repos/${encodeURIComponent(owner)}` +
    `/${encodeURIComponent(repo)}` +
    `/commits/${encodeURIComponent(branch)}`;

  return github<GitHubCommit>(path);
}

async function getVersion(
  owner: string,
  repo: string,
  branch: string
): Promise<string | null> {
  const path =
    `/repos/${encodeURIComponent(owner)}` +
    `/${encodeURIComponent(repo)}` +
    `/contents/package.json` +
    `?ref=${encodeURIComponent(branch)}`;

  try {
    const file = await github<GitHubFile>(path);

    if (!file.content || file.encoding !== "base64") {
      return null;
    }

    try {
      const packageJson = JSON.parse(
        Buffer.from(file.content, "base64").toString("utf8")
      );

      if (typeof packageJson.version === "string") {
        return packageJson.version;
      }

      return null;
    } catch {
      return null;
    }
  } catch (error) {
    // package.json does not exist on this branch
    if (
      error instanceof GitHubRequestError &&
      error.status === 404
    ) {
      return null;
    }

    return null;
  }
}

app.get("/github/:owner/:repo", async (req, res) => {
  const { owner, repo } = req.params;

  try {
    const repository = await github<GitHubRepository>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    );

    const branch = repository.default_branch;

    const commit = await github<GitHubCommit>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
        `/commits/${encodeURIComponent(branch)}`
    );

    return res.json({
      repository: repository.full_name,
      branch,
      commitDate: commit.commit.author?.date ?? null,
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
  console.log(
    `GitBeacon running on http://localhost:${PORT}`
  );

  if (GITHUB_TOKEN) {
    console.log(
      "GitHub authentication: PAT configured"
    );
  } else {
    console.log(
      "GitHub authentication: none (public repositories only)"
    );
  }

  console.log(
    "GitHub branch: detected per repository"
  );
});
