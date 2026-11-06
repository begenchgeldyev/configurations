// Injects the curated memory brief into each primary model request and refreshes
// the journal when a turn finishes. The injection mutates the outgoing request,
// never the persisted transcript, so the chat stays clean while every session
// starts knowing what previous sessions learned.
import { execFile } from "node:child_process"
import { homedir } from "node:os"
import { basename, join } from "node:path"

const MEMORY = join(homedir(), ".local", "bin", "opencode-memory")
const OBSERVE = join(homedir(), ".local", "bin", "opencode-observe")
const BUDGET = "6000"
const BRIEF_TTL_MS = 10 * 60 * 1000
const OBSERVE_DEBOUNCE_MS = 60 * 1000

// A plugin hook that throws fails the user's request, so every failure here is
// swallowed and logged: memory is an enhancement, not a dependency.
function run(command: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, maxBuffer: 1 << 20 }, (error, stdout) => {
      if (error) console.error("memory-brief:", command, error.message)
      resolve(error ? "" : String(stdout))
    })
  })
}

export default {
  id: "memory-brief",
  async setup(ctx: any) {
    if (!ctx?.session?.hook) return
    const briefs = new Map<string, { text: string; at: number }>()
    const childSessions = new Set<string>()
    const controller = new AbortController()

    // The context hook runs before every request, so the brief is cached per
    // project for a few minutes instead of spawning a subprocess each time.
    async function briefFor(project: string): Promise<string> {
      const hit = briefs.get(project)
      if (hit && Date.now() - hit.at < BRIEF_TTL_MS) return hit.text
      const text = (await run(MEMORY, ["brief", "--project", project, "--budget", BUDGET], 3000)).trim()
      if (briefs.size > 64) briefs.clear()
      briefs.set(project, { text, at: Date.now() })
      return text
    }

    try {
      await ctx.session.hook("context", async (event: any) => {
        try {
          const sessionID = event?.sessionID as string | undefined
          if (!sessionID || childSessions.has(sessionID)) return
          // Subagent sessions carry a narrow brief and a cheap model: memory
          // there costs more than it saves, and their prompts are synthetic.
          const info = await ctx.session.get({ sessionID }).catch(() => null)
          if (info?.parentID) {
            childSessions.add(sessionID)
            return
          }
          const directory = info?.location?.directory || ctx.location?.directory || ""
          const text = await briefFor(basename(directory))
          if (!text || text.startsWith("## Память: пусто")) return
          event.system.push({ type: "text", text })
        } catch (error) {
          console.error("memory-brief:", error)
        }
      })
    } catch (error) {
      console.error("memory-brief: context hook unavailable", error)
      return
    }

    // The 15-minute systemd timer is the safety net; this is the fast path so
    // the very next session already sees what this one just learned.
    const last = new Map<string, number>()
    const task = (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        const type = event?.type as string
        if (
          type !== "session.execution.succeeded" &&
          type !== "session.execution.failed" &&
          type !== "session.execution.interrupted"
        ) continue
        const data = event.data as any
        // Shutdown interrupts are resumable, not finished turns.
        if (type === "session.execution.interrupted" && data?.reason === "shutdown") continue
        const sessionID = data?.sessionID as string | undefined
        if (!sessionID) continue
        const now = Date.now()
        if (now - (last.get(sessionID) ?? 0) < OBSERVE_DEBOUNCE_MS) continue
        last.set(sessionID, now)
        void run("/usr/bin/bash", ["-c", `${OBSERVE} && ${MEMORY} brief --write`], 120_000)
      }
    })().catch((error) => {
      if (!controller.signal.aborted) console.error("memory-brief: event subscription failed", error)
    })

    return () => {
      controller.abort()
      void task
    }
  },
}
