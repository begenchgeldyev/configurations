# Global rules

Applies to every project. A project-level `AGENTS.md`/`CLAUDE.md` wins wherever it is more specific.

## 1. Greetings and probes are not work

If the first message is a bare greeting (`hello`, `hi`, `hey`, `привет`), a typo of one
(`gello`, `hell`, `qwe`), `ok`, `test`, `say ok`, `reply with exactly: ok`, or a liveness probe
(`reply OK`, `pong`, `run git status then reply done`), answer in one line and stop.

Do not read files, run tools, spawn lanes, or open a todo list for these. Do not ask a
follow-up question either; the user will say what they need.

Model and agent availability is checked with `opencode-check` (gateways + one
completion per chain model, no session, no tokens) — not by opening a session.

## 2. Stay in the worktree you were given

When a message, brief, or command names a worktree path, branch, or checkout, every read and
write happens there: pass it explicitly (`git -C <path>`, absolute paths, the tool's `workdir`).
Never modify the main checkout as a side effect, and never "tidy up" the primary clone.

If no scope is named and the work needs isolation, ask before creating a worktree.
