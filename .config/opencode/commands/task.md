---
description: Execute a brief file or URL exactly as specified — no re-planning
---

# /task $ARGUMENTS

Execute the brief at `$1` (a path such as `/tmp/ulw-*/task-3-brief.md`, or a URL).

## 1. Read the brief
Fetch `$1` in full — read the file, or fetch the URL. If it is empty or unreachable, stop and ask.

## 2. Treat the brief as the spec
Do not re-plan it, reorder it, or add scope. If an item is impossible as written, stop and report
that instead of substituting your own design.

## 3. Scope rule (verbatim, non-negotiable)
Work ONLY inside the worktree/branch the brief names. Never modify the main checkout.
If the brief does not name a worktree, ask before creating one.

## 4. Execute
Make exactly the changes the brief describes, inside that scope only.

## 5. Checks
Run the repo's own check command from its `AGENTS.md` / `CLAUDE.md`. Never invent a command.
Report the exact command you ran and its result.

## 6. Report
- Files changed (paths)
- Checks run + result
- Every brief item not implemented, and why (or `none`)
