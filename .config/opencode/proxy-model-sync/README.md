# Proxy model sync

A dependency-free OpenCode V2 server plugin that discovers CLIProxyAPI models
and filters the `openai` and `gemini` provider inventories. Tested on OpenCode
2.0.32. Desktop and terminal clients receive the backend's model updates.

## Installation

Keep this directory beside the global `opencode.json`, or symlink it there from
this configuration repository. Register it in the native V2 `plugins` list:

```json
{
  "plugins": [
    {
      "package": "./proxy-model-sync",
      "options": {
        "baseURL": "{env:VPS_IP}",
        "providers": [
          { "id": "openai", "family": "codex", "exclude": ["gpt-6-astra-pro"] },
          { "id": "gemini", "family": "gemini" }
        ]
      }
    }
  ]
}
```

The base URL includes `/v1`, as in the existing provider settings. Credentials
come from the backend's resolved provider settings; this plugin does not read
shell profiles or maintain a second API key. Optional `intervalMs` and
`timeoutMs` default to 300000 and 10000 respectively.

Reload configuration after installation with `opencode api post
/api/location/reload`. This reloads all loaded locations. Desktop must connect
to a backend with this global configuration and its proxy environment variables.
If Desktop runs on another machine/backend, install the same plugin and
configuration there. No Desktop UI extension is required.

## Behavior

- Refresh at startup, on provider/credential events, and every five minutes.
- Deduplicate discovery for providers sharing an endpoint and credentials.
- Match existing aliases by upstream `modelID`, preserving their metadata and
  variants. Thus a Fast alias can remain when its base model is advertised.
- Respect disabled source models, earlier removals, and explicit exclusions.
- Add new Codex/Gemini text IDs. Exact known catalog capabilities are reused;
  unknown models get text-only capabilities, no tools, and conservative limits
  (8192 context / 2048 output) until explicitly configured with verified metadata.
- Do not add image/audio/embedding models to chat choices or add Claude providers.
- Only manage providers and model routes using the configured proxy endpoint.
- A valid empty list clears matching choices. Failed or malformed discovery
  retains the last valid list; failed first discovery retains configured models.
- Cache inventories in OpenCode's plugin storage, scoped by a hash of endpoint
  and request headers. API keys and raw response bodies are never logged or cached.
- Stop timers, abort requests, and release the transform when unloaded.

This synchronizes advertised availability, not quota/health: a listed model can
still fail upstream. Other OpenCode providers remain independent.

## Checks

Run `npm test` here. Tests cover additions/removals, upstream aliases,
exclusions, independent routes, cached/empty inventories, malformed responses,
network/authentication failures, delayed provider startup, and cancellation.

Inspect plugin activation via `opencode api get /api/plugin`; look for
`local.proxy-model-sync` with state `active`. Read picker inventory with
`opencode api get /api/model`. Those APIs return `{ location, data }` envelopes.

### Verified on 2026-11-01

- All 12 automated tests passed.
- Plugin active in the global OpenCode 2.0.32 backend after configuration reload.
- 26 Codex choices (including supported upstream aliases) and four Gemini
  choices; every upstream model ID appeared in the live proxy inventory.
- `gpt-6-astra-pro` excluded; `codex-auto-review` discovered automatically.
- OpenCode generation requests for `openai/gpt-6.1-terra` and
  `gemini/gemini-3-flash` each returned `OK`.
- Desktop was not running locally, so verification covered its backend model
  registry rather than a visual check of the Desktop picker.
