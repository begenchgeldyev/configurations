import { applyInventory, endpoint, parseInventory, route } from "./inventory.js";

const DEFAULT_TARGETS = [
  { id: "openai", family: "codex" },
  { id: "gemini", family: "gemini" },
];

export function createSync(ctx, {
  fetchImpl = fetch,
  warn = (message) => console.warn(`[proxy-model-sync] ${message}`),
} = {}) {
  const expectedEndpoint = endpoint(ctx.options.baseURL);
  if (!expectedEndpoint) throw new Error("proxy-model-sync requires a valid baseURL option");
  const targets = ctx.options.providers ?? DEFAULT_TARGETS;
  if (!Array.isArray(targets) || targets.some((target) => !target || typeof target.id !== "string" ||
      !["codex", "gemini"].includes(target.family) ||
      (target.exclude !== undefined && (!Array.isArray(target.exclude) || target.exclude.some((id) => typeof id !== "string"))))) {
    throw new Error("proxy-model-sync has invalid providers options");
  }
  const intervalMs = ctx.options.intervalMs ?? 300000;
  const timeoutMs = ctx.options.timeoutMs ?? 10000;
  if (!Number.isFinite(intervalMs) || intervalMs < 1000 || !Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new Error("proxy-model-sync has invalid timing options");
  }
  const states = new Map();
  const failures = new Set();
  const lifetime = new AbortController();
  let timer;
  let registration;
  let inFlight;
  let eventsTask;
  let stopped = false;

  function report(key, message) {
    if (!failures.has(key)) warn(message);
    failures.add(key);
  }

  async function load(currentRoute) {
    const { identity, baseURL, headers } = currentRoute;
    const cacheKey = `inventory/v1/${identity}`;
    let changed = false;
    if (!states.has(identity)) {
      try {
        const cached = await ctx.storage.get(cacheKey);
        if (cached?.identity === identity) {
          states.set(identity, { models: parseInventory({ data: cached.models }) });
          changed = true;
        }
      } catch {
        report(`cache/${identity}`, "Could not read cached inventory; attempting discovery.");
      }
    }
    if (stopped) return changed;
    const controller = new AbortController();
    const abort = () => controller.abort();
    lifetime.signal.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(abort, timeoutMs);
    timeout.unref?.();
    try {
      const response = await fetchImpl(`${baseURL}/models`, {
        headers, signal: controller.signal, redirect: "error",
      });
      if (!response.ok) throw new Error("discovery rejected");
      const models = parseInventory(await response.json());
      if (stopped) return changed;
      failures.delete(identity);
      if (JSON.stringify(states.get(identity)?.models) !== JSON.stringify(models)) {
        states.set(identity, { models });
        changed = true;
        try {
          await ctx.storage.set(cacheKey, { identity, models });
        } catch {
          report(`cache/${identity}`, "Could not persist inventory; using the in-memory result.");
        }
      }
    } catch {
      if (!stopped) report(identity, "Model discovery failed; retaining the last successful inventory (or configured models on first use).");
    } finally {
      clearTimeout(timeout);
      lifetime.signal.removeEventListener("abort", abort);
    }
    return changed;
  }

  async function refreshOnce() {
    if (stopped) return;
    // list() returns resolved provider settings, including environment substitutions.
    const { data: providers } = await ctx.provider.list();
    const routes = new Map();
    for (const target of targets) {
      const currentRoute = route(providers.find((provider) => provider.id === target.id), expectedEndpoint);
      if (currentRoute) routes.set(currentRoute.identity, currentRoute);
    }
    const changed = await Promise.all([...routes.values()].map(load));
    if (!stopped && registration && changed.some(Boolean)) await ctx.model.reload();
  }

  function refresh() {
    if (stopped) return Promise.resolve();
    if (!inFlight) {
      inFlight = refreshOnce()
        .catch(() => report("refresh", "Could not refresh provider inventory; retrying next interval."))
        .finally(() => { inFlight = undefined; });
    }
    return inFlight;
  }

  return {
    refresh,
    async start() {
      // Provider configuration can settle after plugin setup in OpenCode V2.
      // Follow its updates so the initial discovery does not wait for the timer.
      eventsTask = (async () => {
        for await (const _event of ctx.event.subscribe({
          types: ["provider.updated", "credential.updated", "credential.switched"],
          signal: lifetime.signal,
        })) {
          await refresh();
        }
      })().catch(() => {
        if (!stopped) report("events", "Provider event stream ended; periodic refresh remains active.");
      });
      await refresh();
      if (stopped) return;
      registration = await ctx.model.transform((editor) => applyInventory(editor, targets, states, expectedEndpoint));
      timer = setInterval(() => void refresh(), intervalMs);
      timer.unref?.();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      lifetime.abort();
      await inFlight;
      await eventsTask;
      await registration?.dispose();
    },
  };
}
