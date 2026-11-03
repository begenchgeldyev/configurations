---
description: Take a Jira ticket end-to-end — fetch it, create a worktree, implement, commit, open an MR
---

# /ticket $ARGUMENTS

Run the full ticket pipeline for `$1`. Do not skip steps; ask the user at most once.

## 1. Parse the key
`$1` is either a bare key (`PNRMN-123`) or a URL like `https://projects.synecta.tech/browse/PNRMN-123`.
Extract `PROJECT-NUMBER`. If `$1` is empty, ask for the key and stop.

## 2. Fetch the ticket
Call the jira MCP tool `get_issue` (`jira_jira_get_issue`) with the key. Extract:
summary, issue type (bug vs story), description, acceptance criteria, linked Figma / MR links, repro steps.

## 3. Choose the repo
Allowed repos, all under `/home/begench/projects/`: `rz-web-client`, `rz-web-server`, `device-sdk`, `spectra`.
Infer from the ticket text (components, labels, stack/file hints, linked MRs). Only if it is genuinely
ambiguous, ask ONE question offering exactly those four options.

## 4. Create the worktree
Use the `worktrees` skill convention — not ad-hoc git commands:
- branch: `bugfix/PNRMN-NNN/<slug>` for bugs, `feature/PNRMN-NNN/<slug>` otherwise (`<slug>` = 2–4 kebab words)
- path: `<repo>/.slim/worktrees/<slug>`
- `git worktree add -b <branch> .slim/worktrees/<slug> <base>` from inside the repo; base = `main` unless the ticket says otherwise

Then switch into the worktree. All edits, builds and tests happen there — never touch the main checkout.

## 5. Implement
The acceptance criteria are the definition of done. Follow the repo's `AGENTS.md` / `CLAUDE.md` for conventions.

## 6. Run the repo's own checks
Read `AGENTS.md` (then `CLAUDE.md`) in the repo for the check command — lint / typecheck / test.
Never invent a command. If none is documented, say so and ask instead of guessing.

## 7. Commit
Use the `commit` skill conventions: atomic commits, the repo's message style, task trailer.

## 8. Open the MR
Use the `create-mr` skill (`~/.agents/skills/create-mr`); push the branch first if it needs it.

## 9. Report
Print exactly:
- Jira key
- repo
- worktree path
- branch
- commit SHAs (short)
- MR URL
- anything left undone (or `none`)
