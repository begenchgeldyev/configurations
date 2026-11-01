import { createHash } from "node:crypto";

export function endpoint(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return;
    return url.href.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}

export function route(provider, expectedEndpoint) {
  const baseURL = endpoint(provider?.settings?.baseURL);
  if (!baseURL || baseURL !== expectedEndpoint || provider.activation === "disabled") return;
  const headers = new Headers(provider.headers);
  if (typeof provider.settings?.apiKey === "string" && provider.settings.apiKey) {
    headers.set("Authorization", `Bearer ${provider.settings.apiKey}`);
  }
  // Hash credentials too: never reuse another account's inventory on key rotation.
  const identity = createHash("sha256")
    .update(JSON.stringify([baseURL, [...headers.entries()].sort()]))
    .digest("hex");
  return { baseURL, headers, identity };
}

export function parseInventory(payload) {
  if (!payload || !Array.isArray(payload.data) || payload.data.length > 10000) {
    throw new Error("invalid model inventory");
  }
  const models = new Map();
  for (const entry of payload.data) {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim() || entry.id.length > 512 ||
        entry.id !== entry.id.trim() || /[\x00-\x1f]/.test(entry.id) ||
        (entry.owned_by !== undefined && typeof entry.owned_by !== "string")) {
      throw new Error("invalid model inventory");
    }
    models.set(entry.id, { id: entry.id, ...(entry.owned_by ? { owned_by: entry.owned_by } : {}) });
  }
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function isNewChatModel(entry, family) {
  if (/(?:image|embedding|audio|tts|transcri|realtime|video)/i.test(entry.id)) return false;
  if (family === "gemini") return entry.id.startsWith("gemini-");
  return /^(?:gpt-|codex-|o[1-9](?:-|$))/.test(entry.id) &&
    (!entry.owned_by || ["openai", "codex"].includes(entry.owned_by));
}

function newModel(providerID, id, template) {
  // Never copy another provider's endpoint, credentials, native settings or variants.
  return {
    id, modelID: id, providerID, name: template?.name ?? id,
    type: "chat", enabled: true, status: template?.status ?? "active",
    capabilities: structuredClone(template?.capabilities ?? { tools: false, input: ["text"], output: ["text"] }),
    limit: structuredClone(template?.limit ?? { context: 8192, output: 2048 }),
    time: structuredClone(template?.time ?? { released: 0 }),
    cost: [], variants: [],
  };
}

export function applyInventory(editor, targets, states, expectedEndpoint) {
  for (const target of targets) {
    const record = editor.provider.get(target.id);
    const currentRoute = route(record?.provider, expectedEndpoint);
    const state = currentRoute && states.get(currentRoute.identity);
    if (!state) continue; // Before first success, or an unrelated provider/connection.
    const advertised = new Map(state.models.map((entry) => [entry.id, entry]));
    const excluded = new Set(target.exclude ?? []);
    const existing = [...editor.list(target.id)];
    // Disabled and previously removed source models must not be recreated.
    const sourceIDs = new Set(record.models.keys());
    const candidates = new Set(existing.map((model) => model.id));
    for (const model of existing) {
      const modelEndpoint = model.settings?.baseURL;
      if (modelEndpoint && endpoint(modelEndpoint) !== expectedEndpoint) continue;
      const modelKey = model.settings?.apiKey;
      if (modelKey && modelKey !== record.provider.settings?.apiKey) continue;
      const upstreamID = model.modelID || model.id;
      if (!advertised.has(upstreamID) || excluded.has(model.id) || excluded.has(upstreamID)) {
        editor.remove(target.id, model.id);
      }
    }
    for (const entry of state.models) {
      if (sourceIDs.has(entry.id) || candidates.has(entry.id) || excluded.has(entry.id) || !isNewChatModel(entry, target.family)) continue;
      const catalog = editor.provider.get(target.family === "gemini" ? "google" : "openai");
      const template = catalog?.models.get(entry.id);
      if (template && ((template.type && template.type !== "chat") || template.enabled === false)) continue;
      editor.update(target.id, entry.id, (draft) => Object.assign(draft, newModel(target.id, entry.id, template)));
    }
  }
}
