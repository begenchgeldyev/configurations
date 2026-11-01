import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { EventEmitter, on } from "node:events";
import test from "node:test";
import { applyInventory, endpoint, parseInventory, route } from "../inventory.js";
import { createSync } from "../sync.js";

const baseURL = "http://127.0.0.1:8317/v1";
const provider = (id = "openai", key = "test-secret") => ({
  id, activation: "enabled", settings: { baseURL, apiKey: key },
});
const model = (id, extra = {}) => ({
  id, modelID: id, providerID: "openai", enabled: true,
  capabilities: { tools: true, input: ["text", "image"], output: ["text"] },
  limit: { context: 100000, output: 10000 }, variants: [{ id: "high" }], ...extra,
});
const payload = (...ids) => ({ data: ids.map((id) => ({ id, owned_by: "openai" })) });
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

function editorFor(models, providers = [provider()], extraSources = []) {
  const values = new Map(models.map((item) => [`${item.providerID}/${item.id}`, structuredClone(item)]));
  const records = new Map(providers.map((p) => [p.id, {
    provider: p,
    models: new Map(models.filter((item) => item.providerID === p.id).map((item) => [item.id, item])),
  }]));
  for (const record of extraSources) records.set(record.provider.id, record);
  return {
    provider: { get: (id) => records.get(id) },
    list: (id) => [...values.values()].filter((item) => !id || item.providerID === id),
    remove: (id, name) => values.delete(`${id}/${name}`),
    update(id, name, fn) {
      const draft = values.get(`${id}/${name}`) ?? {};
      fn(draft);
      values.set(`${id}/${name}`, draft);
    },
  };
}

function filter(editor, body, targets = [{ id: "openai", family: "codex" }]) {
  const identity = route(provider(), baseURL).identity;
  applyInventory(editor, targets, new Map([[identity, { models: parseInventory(body) }]]), baseURL);
}

test("validates complete responses, normalizes ordering, and accepts authoritative empty lists", () => {
  assert.deepEqual(parseInventory(payload("b", "a", "a")).map((x) => x.id), ["a", "b"]);
  assert.deepEqual(parseInventory({ data: [] }), []);
  for (const value of [{}, { data: null }, { data: [{ id: 4 }] }, { data: [{ id: " x" }] }, { data: [{ id: "x", owned_by: 1 }] }]) {
    assert.throws(() => parseInventory(value), /invalid/);
  }
  assert.equal(endpoint(baseURL + "/"), baseURL);
  assert.equal(endpoint("https://user:pass@example.com/v1"), undefined);
});

test("filters missing upstream IDs while preserving aliases, metadata, disabled entries and exclusions", () => {
  const alias = model("fast-alias", { modelID: "gpt-live", body: { service_tier: "priority" } });
  const disabled = model("gpt-disabled", { enabled: false });
  const editor = editorFor([model("gpt-live"), alias, model("retired"), disabled, model("gpt-excluded")]);
  filter(editor, payload("gpt-live", "gpt-disabled", "gpt-excluded"), [{ id: "openai", family: "codex", exclude: ["gpt-excluded"] }]);
  assert.deepEqual(editor.list().map((x) => x.id), ["gpt-live", "fast-alias", "gpt-disabled"]);
  assert.deepEqual(editor.list().find((x) => x.id === "fast-alias"), alias);
  assert.equal(editor.list().find((x) => x.id === "gpt-disabled").enabled, false);
});

test("new unknown text models use conservative metadata and skip Claude, image and wrong-owner models", () => {
  const editor = editorFor([]);
  filter(editor, { data: [
    { id: "gpt-new", owned_by: "openai" },
    { id: "gpt-image-new", owned_by: "openai" },
    { id: "claude-new", owned_by: "antigravity" },
    { id: "gpt-oss-new", owned_by: "antigravity" },
  ] });
  assert.deepEqual(editor.list().map((x) => x.id), ["gpt-new"]);
  assert.equal(editor.list()[0].capabilities.tools, false);
  assert.deepEqual(editor.list()[0].capabilities.input, ["text"]);
  assert.equal(editor.list()[0].limit.context, 8192);
});

test("new Gemini IDs reuse exact catalog capabilities but not native Google routing or variants", () => {
  const template = model("gemini-new", { providerID: "google", settings: { baseURL: "https://google.example", apiKey: "other-key" } });
  const source = { provider: provider("google"), models: new Map([[template.id, template]]) };
  const editor = editorFor([], [provider("gemini")], [source]);
  filter(editor, { data: [{ id: "gemini-new" }, { id: "gemini-flash-image" }] }, [{ id: "gemini", family: "gemini" }]);
  const added = editor.list()[0];
  assert.equal(added.providerID, "gemini");
  assert.deepEqual(added.capabilities, template.capabilities);
  assert.deepEqual(added.limit, template.limit);
  assert.equal(added.settings, undefined);
  assert.deepEqual(added.variants, []);
  assert.equal(editor.list().length, 1);
});

test("a source model removed by an earlier policy is never resurrected", () => {
  const editor = editorFor([model("gpt-hidden")]);
  editor.remove("openai", "gpt-hidden");
  filter(editor, payload("gpt-hidden"));
  assert.deepEqual(editor.list(), []);
});

test("other providers, endpoints and per-model credentials are unaffected", () => {
  const independent = model("gpt-independent", { settings: { baseURL: "https://api.openai.com/v1" } });
  const otherKey = model("gpt-other-key", { settings: { apiKey: "independent" } });
  const otherProvider = model("other", { providerID: "another" });
  const editor = editorFor([independent, otherKey, otherProvider]);
  filter(editor, { data: [] });
  assert.equal(editor.list().length, 3);
  const moved = editorFor([model("gpt-live")], [{ ...provider(), settings: { baseURL: "https://api.openai.com/v1" } }]);
  filter(moved, { data: [] });
  assert.equal(moved.list().length, 1);
});

function harness(fetchImpl, options = {}, cache = new Map()) {
  const warnings = [];
  let transform;
  let reloads = 0;
  let disposed = false;
  let providers = [provider(), provider("gemini")];
  const events = new EventEmitter();
  const ctx = {
    options: { baseURL, ...options },
    provider: { list: async () => ({ location: { directory: "/test" }, data: providers }) },
    event: { subscribe: ({ signal }) => on(events, "update", { signal }) },
    storage: { get: async (key) => cache.get(key), set: async (key, value) => { cache.set(key, value); } },
    model: {
      reload: async () => { reloads++; },
      transform: async (fn) => { transform = fn; return { dispose: async () => { disposed = true; } }; },
    },
  };
  const sync = createSync(ctx, { fetchImpl, warn: (message) => warnings.push(message) });
  return {
    sync, cache, warnings, ctx,
    reloads: () => reloads, disposed: () => disposed,
    providers: (value) => { providers = value; },
    emit: () => events.emit("update", { type: "provider.updated" }),
    filtered(models, ps = providers) {
      const editor = editorFor(models, ps);
      transform(editor);
      return editor.list();
    },
  };
}

test("refresh updates both providers, deduplicates requests, caches no credentials, reloads only on change", async (t) => {
  let calls = 0;
  let body = payload("gpt-live");
  const h = harness(async (url, init) => {
    calls++;
    assert.equal(url, `${baseURL}/models`);
    assert.equal(init.headers.get("Authorization"), "Bearer test-secret");
    assert.equal(init.redirect, "error");
    return response(body);
  });
  t.after(() => h.sync.stop());
  await h.sync.start();
  assert.equal(calls, 1);
  assert.equal(h.filtered([model("gpt-retired")])[0].id, "gpt-live");
  assert.ok(!JSON.stringify([...h.cache]).includes("test-secret"));
  await Promise.all([h.sync.refresh(), h.sync.refresh()]);
  assert.equal(calls, 2);
  assert.equal(h.reloads(), 0);
  body = payload("gpt-next");
  await h.sync.refresh();
  assert.equal(h.reloads(), 1);
  assert.deepEqual(h.filtered([model("gpt-live")]).map((x) => x.id), ["gpt-next"]);
  body = { data: [] };
  await h.sync.refresh();
  assert.equal(h.reloads(), 2);
  assert.deepEqual(h.filtered([model("gpt-live")]), []);
});

test("invalid data, HTTP errors and network errors retain successful discovery and redact logs", async (t) => {
  let next = () => response(payload("gpt-live"));
  const h = harness(async () => next());
  t.after(() => h.sync.stop());
  await h.sync.start();
  for (const action of [() => response({ error: "secret" }), () => response({}, 401), () => { throw new Error("test-secret"); }]) {
    next = action;
    await h.sync.refresh();
    assert.deepEqual(h.filtered([model("gpt-live"), model("gpt-retired")]).map((x) => x.id), ["gpt-live"]);
  }
  assert.equal(h.reloads(), 0);
  assert.equal(h.warnings.length, 1);
  assert.ok(!h.warnings.join().includes("test-secret"));
});

test("offline startup restores cache, including empty inventories, but not another account's cache", async (t) => {
  const cache = new Map();
  const first = harness(async () => response({ data: [] }), {}, cache);
  await first.sync.start();
  await first.sync.stop();
  const offline = async () => { throw new Error("offline"); };
  const restored = harness(offline, {}, cache);
  t.after(() => restored.sync.stop());
  await restored.sync.start();
  assert.deepEqual(restored.filtered([model("gpt-old")]), []);
  const other = harness(offline, {}, cache);
  other.providers([provider("openai", "different-key")]);
  t.after(() => other.sync.stop());
  await other.sync.start();
  assert.equal(other.filtered([model("gpt-old")]).length, 1);
  assert.notEqual(route(provider(), baseURL).identity, route(provider("openai", "different-key"), baseURL).identity);
});

test("failed cold start keeps configured choices and later recovers", async (t) => {
  let online = false;
  const h = harness(async () => {
    if (!online) throw new Error("offline");
    return response(payload("gpt-new"));
  });
  t.after(() => h.sync.stop());
  await h.sync.start();
  assert.equal(h.filtered([model("gpt-old")])[0].id, "gpt-old");
  online = true;
  await h.sync.refresh();
  assert.deepEqual(h.filtered([model("gpt-old")]).map((x) => x.id), ["gpt-new"]);
});

test("discovers providers that settle after plugin setup without waiting for the timer", async (t) => {
  let calls = 0;
  const h = harness(async () => { calls++; return response(payload("gpt-new")); });
  h.providers([]);
  t.after(() => h.sync.stop());
  await h.sync.start();
  assert.equal(calls, 0);
  h.providers([provider()]);
  h.emit();
  await delay(0);
  await h.sync.refresh();
  assert.ok(calls >= 1);
  assert.equal(h.reloads(), 1);
  assert.deepEqual(h.filtered([model("gpt-old")]).map((x) => x.id), ["gpt-new"]);
});

test("timeout preserves configured inventory and cleanup cancels in-flight discovery", async () => {
  let signal;
  const h = harness((_url, init) => {
    signal = init.signal;
    return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  }, { timeoutMs: 20 });
  await Promise.all([h.sync.start(), delay(30)]);
  assert.equal(signal.aborted, true);
  assert.equal(h.filtered([model("gpt-old")]).length, 1);
  const pending = h.sync.refresh();
  await delay(1);
  await h.sync.stop();
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(h.disposed(), true);
});
