import "dotenv/config";
import express from "express";

const app = express();

const PORT = Number(process.env.PORT ?? 3000);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API_URL =
  process.env.GITHUB_API_URL ?? "https://api.github.com";

type GitHubRepository = {
  default_branch: string;
};

type GitHubCommit = {
  sha: string;
};

type GitHubFile = {
  content?: string;
  encoding?: string;
};

async function github<T>(
  path: string,
  authenticated = false
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (authenticated && GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  }

  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    headers,
  });

  if (!response.ok) {
    let message = "";

    try {
      const body = await response.json();

      if (body?.message) {
        message = `: ${body.message}`;
      }
    } catch {
      // Ignore invalid JSON responses
    }

    throw new Error(
      `GitHub API returned ${response.status}${message}`
    );
  }

  return response.json() as Promise<T>;
}

app.get("/github/:owner/:repo", async (req, res) => {
  const { owner, repo } = req.params;

  const requestedBranch =
    typeof req.query.branch === "string"
      ? req.query.branch
      : undefined;

  try {
    const encodedOwner = encodeURIComponent(owner);
    const encodedRepo = encodeURIComponent(repo);

    const repositoryPath =
      `/repos/${encodedOwner}/${encodedRepo}`;

    /*
     * First try WITHOUT authentication.
     *
     * This means public repositories don't care if the
     * configured PAT is missing or invalid.
     */
    let repository: GitHubRepository;
    let authenticated = false;

    try {
      repository = await github<GitHubRepository>(
        repositoryPath,
        false
      );
    } catch (publicError) {
      /*
       * The repository wasn't accessible publicly.
       *
       * If we have a PAT, try again authenticated.
       */
      if (!GITHUB_TOKEN) {
        throw publicError;
      }

      repository = await github<GitHubRepository>(
        repositoryPath,
        true
      );

      authenticated = true;
    }

    /*
     * Automatically use the repository's default branch
     * unless ?branch=... was supplied.
     */
    const branch =
      requestedBranch ?? repository.default_branch;

    const encodedBranch = encodeURIComponent(branch);

    /*
     * Get the latest commit.
     */
    const commit = await github<GitHubCommit>(
      `/repos/${encodedOwner}/${encodedRepo}/commits/${encodedBranch}`,
      authenticated
    );

    /*
     * Get package.json.
     */
    let version: string | null = null;

    try {
      const packageJson = await github<GitHubFile>(
        `/repos/${encodedOwner}/${encodedRepo}/contents/package.json?ref=${encodedBranch}`,
        authenticated
      );

      if (
        packageJson.content &&
        packageJson.encoding === "base64"
      ) {
        const decoded = Buffer.from(
          packageJson.content,
          "base64"
        ).toString("utf8");

        const parsed = JSON.parse(decoded);

        if (typeof parsed.version === "string") {
          version = parsed.version;
        }
      }
    } catch {
      /*
       * package.json doesn't exist.
       * That's okay — version will be null.
       */
    }

    res.json({
      commit: commit.sha.substring(0, 7),
      version,
    });
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error
        ? error.message
        : "Unknown error";

    res.status(500).json({
      error: "Failed to retrieve repository information",
      message,
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

app.listen(PORT, () => {
  console.log(
    `GitBeacon running on http://localhost:${PORT}`
  );
});
