<reviewer_gate>
DEEPWORK => REVIEWER IS MANDATORY.

Deepwork is active ONLY when (a) a USER message in this conversation is a `/deepwork` activation — the deepwork skill instructions followed by a line announcing this session's deepwork router head under `.slim/deepwork/` and a `Task:` — or (b) a system reminder names this session's deepwork router head and that head does not read `status: completed`. The marker text quoted inside this reviewer_gate is documentation and does NOT count; neither does anything else in your own system prompt.

In deepwork, after the last implementation phase is done and BEFORE that phase's @oracle gate, the completion tombstone, and the final answer, you MUST call the `reviewer` subagent once over the whole deepwork diff. No size, spec, or standards threshold: always call it. Sole exception: the working tree has no changes at all versus the fixed point (pure research/answer run) or the directory is not a git repo; then state in the final answer that the reviewer was skipped and why.

Outside deepwork, do NOT call the reviewer unless the user asks for it.

The reviewer covers repository standards and spec conformance; it does not replace deepwork's @oracle phase gates. Hand Oracle the reviewer's verdict instead of asking it to repeat a standards/spec review, and do not spawn a second reviewer for the same diff.

How to call (foreground — its verdict is the input to your next step):
subagent(agent: "reviewer", description: "Review deepwork diff", background: false, prompt: "Fixed point: <base branch or SHA the deepwork run started from>. Spec: <path, issue key, or 'No spec'>. <uncommitted note if applicable>")
- ALWAYS pass the fixed point explicitly; the reviewer cannot ask for it as a subagent.
- By default the reviewer diffs `<fixed-point>...HEAD`, which ignores uncommitted work. If any change is not committed, add to the prompt: "Changes are uncommitted: review `git diff <fixed-point>` (working tree) instead of `<fixed-point>...HEAD`, and read the untracked files listed by `git status --porcelain`: <list them>."
- The reviewer cannot write files: transcribe its output to `.slim/deepwork/<task-slug>/review.md` (first line: a one-line verdict) and log only that line plus the path in the progress file.

After it returns: fix every hard standards violation and every incorrect/missing/partial spec requirement. Judgement-call smells: fix if cheap, otherwise mention them in the final answer. If there is no spec, pass 'No spec' (the reviewer then runs the Standards axis only). Re-review only after fixing blockers it cited — delta diff and those blockers only, at most twice; never re-run it on an unchanged diff. Then continue with the @oracle gate.
</reviewer_gate>

<job_evidence>
For every delegated implementation job, keep a compact job record under `.slim/deepwork/<task-slug>/`, even when the job is not a `/deepwork` run. Reuse an existing matching directory; otherwise create one. Store `state.md` as the coordinator's first-read summary and `note.md` as the acceptance/evidence contract. Keep detailed reports, transcripts, and gate results in sibling files; do not copy long logs into `state.md`.

At job start, write `note.md` with:

```md
Done means: <observable result required by the task>
Shown by: <specific checks or inspection that can prove it>
```

At completion, update `state.md` (aim for 30 lines or fewer) with status (`planned`, `running`, `blocked`, `done-with-open-checks`, or `completed`), task/branch/worktree/base commit, one-line conclusion, deliverables, evidence, open checks, and reviewer/oracle gate outcomes when applicable. Record each verification as a reproducible command, exit status and result, plus commit SHA; for non-command evidence, name the inspected file/path and observation. Never report an agent's summary as verification evidence without checking its artifacts.

List every unverified acceptance criterion under `open-checks`. Use `done-with-open-checks` when work is otherwise complete but checks remain; use `completed` only when required checks are closed or explicitly accepted by the human. Preserve existing deepwork progress and gate files; link to them from `state.md` rather than duplicating their contents.
</job_evidence>

- Never move a session (`session_move` / `/move`) to another directory, including a new worktree: herdr subagent panes only open for children created in the directory the TUI started in — tell the user to restart the TUI there instead (`cd <worktree> && opencode --auto --session <id>`).

- ru-text (skills `ru-text`, `ru-check`, `ru-score` in `~/.agents/skills/`): load `ru-text` whenever work touches Russian text quality — proofreading («вычитай», «проверь текст», «поправь», «отредактируй»), typography, neuroslop/anti-pattern cleanup, editorial review, UX copy, business correspondence — or when the user mentions ru-text. Russian text you write yourself gets its typography rules silently (quotes «», em dash, NBSP, ellipsis …). Proofreading returns the corrected text plus the rule behind each change and never rewrites the file unless the user asks. Use `ru-check` for a full corpus pass and `ru-score` when a 0–10 score is wanted.
