# gitbeacon

A tiny API that tells you when a GitHub repository was last updated. Point it at any repo and it returns the repo name, its default branch, and the date of the latest commit on that branch, formatted for humans.

> **Note:** this is an all-in-one file project (`index.ts`). I don't have the motivation to make it a full thing.

## Features

- Latest commit date on the default branch, formatted for humans (e.g. `27 September 2026 at 10:56 BST`)
- Default branch detected automatically per repository
- Configurable timezone
- Works with public repos without a token, and private or org repos with a GitHub PAT
- GitHub errors passed through with their original status code
- `/health` endpoint
- Written in TypeScript, one file

## Requirements

- Node.js 18 or newer (uses the built-in `fetch`)
- A GitHub personal access token for private repositories

## Setup

```bash
npm install express dotenv
npm install -D typescript tsx @types/express @types/node
```

Create a `.env` file in the project root:

```env
GITHUB_TOKEN=github_pat_xxxxxxxx
PORT=3000
TIMEZONE=Europe/London
```

Run it:

```bash
npx tsx index.ts
```

## Configuration

| Variable         | Default                  | Description                                            |
| ---------------- | ------------------------ | ------------------------------------------------------ |
| `GITHUB_TOKEN`   | none                     | GitHub PAT. Without one, only public repos work.       |
| `PORT`           | `3000`                   | Port the server listens on.                            |
| `TIMEZONE`       | `Europe/London`          | IANA timezone used to format the commit date.          |
| `GITHUB_API_URL` | `https://api.github.com` | Override for GitHub Enterprise.                        |

## Usage

### `GET /github/:owner/:repo`

```bash
curl http://localhost:3000/github/nullcloud-org/docs-site
```

```json
{
  "repository": "nullcloud-org/docs-site",
  "branch": "main",
  "commitDate": "27 September 2026 at 10:56 BST"
}
```

### `GET /health`

```json
{ "status": "ok" }
```

### Errors

If GitHub rejects a request, gitbeacon returns the same status code with a message:

```json
{ "error": "GitHub API returned 404: Not Found" }
```

Anything unexpected returns `500`.

## GitHub token permissions

Use a fine-grained PAT with:

- **Resource owner:** the account or org that owns the repos (e.g. `nullcloud-org`)
- **Repository access:** the repos you want to query
- **Contents:** Read-only
- **Metadata:** Read-only (added automatically)

If you get `403 Resource not accessible by personal access token`, the token is valid but is missing one of the above, usually the wrong resource owner or org approval still pending. Restart the server after changing `.env`.

## Ideas

Not implemented yet, but the data is available from the GitHub API:

- Commit SHA and commit message
- Project version from `package.json`
- Commit author and link
