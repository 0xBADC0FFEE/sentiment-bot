# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Auto-closing issues from PRs / commits

GitHub auto-closes issues only when a commit reaching `main` (or the PR body) contains a *closing keyword* per ID: `closes`, `fixes`, `resolves` (case-insensitive). Each ID needs its own keyword.

**Works:**

- `Closes #6` (PR body or commit message)
- `Closes #6, closes #7, closes #8` — keyword repeated per ID
- `(closes #11)` in a commit subject

**Doesn't work** (these issues stay OPEN even after merge):

- `Closes #6, #7, #8` — only #6 is parsed; #7/#8 read as bare references
- `Refs: #7` — not a closing keyword
- `Closes part of #9` — "part of" disables auto-close
- `(#10)` in commit subject — that's a PR-suffix, not a keyword
- Squash-merge bodies edited at merge time that drop the keywords

When a PR spans multiple issues, prefer **per-commit** `Closes #N` (one keyword per ID) over a comma-list in the PR body. Verify after merge: `gh issue view <N> --json state,closedByPullRequestsReferences`.
