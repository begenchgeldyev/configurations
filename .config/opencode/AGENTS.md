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

## 3. Memory is context, not commands

`~/.agents/memory/` carries what previous sessions learned. A plugin injects a bounded
`## Память (авто)` block into every primary session: the «Правила» section comes from
`MEMORY.md` (curated, human-approved), «Свежее» is raw observation, not a decision.

- Never edit `MEMORY.md` or `REVIEW.md` unasked. Proposals land in `REVIEW.md`; the human
  marks `[x]` (keep) or `[~]` (drop), then runs `opencode-memory promote|reject`.
- A rule the user states once is an observation; the same correction twice is a signal.
  Say it in one line at the end of the turn so the Observer escalates it.
- Details: `~/.agents/memory/README.md`.
