# CLIProxyAPI model synchronization for OpenCode

## Goal

Keep OpenCode's Codex and Gemini model choices synchronized with the configured
CLIProxyAPI `/v1/models` inventory. Support OpenCode V2 Desktop and terminal
clients through a server-side plugin loaded from the user's global configuration.

## Approach

Use the V2 provider/model transform APIs and registry reload notifications.
A scheduled configuration-rewriting script was considered, but a plugin supports
live registry updates and avoids repeatedly rewriting user configuration.

The integration runs on the OpenCode backend, which is separate from the remote
CLIProxyAPI server. Desktop must connect to a backend that loads this plugin.
Configure it globally for the current user so the local Desktop backend and
terminal backend can both load it.

## Discovery and filtering

- Discover the configured endpoint and credentials for the `openai` and `gemini`
  proxy providers, using resolved settings rather than embedding credentials.
- Only synchronize those providers when they point to the configured proxy;
  leave other providers and independently authenticated connections unchanged.
- Fetch the inventory at plugin startup and every five minutes with a bounded
  timeout and no overlapping requests.
- Match each existing entry using its upstream model ID, preserving aliases,
  capabilities, limits, variants, and user exclusions.
- Remove choices absent from a successful inventory response.
- Add newly advertised Codex/Gemini text models using exact known catalog
  metadata where available. Unknown IDs use conservative defaults; do not infer
  tool, vision, reasoning, or context capabilities from a name alone.
- Do not reintroduce the removed Claude provider. Image-only models are not
  added as chat choices.
- Reload the registry only when the effective inventory changes.

## State and errors

Store the last valid inventory and its endpoint identity in plugin storage, with
no API keys or authorization headers. Reuse a matching cache on startup and on
network, authentication, timeout, or malformed-response failures. With no usable
cache and a failed initial fetch, retain the existing configured inventory.

A well-formed empty inventory is authoritative; an invalid response must not
erase the picker. Log concise errors without credentials or raw response bodies.
Clear timers and abort outstanding requests when the plugin unloads.

## Files and integration

Place a small local V2 plugin package under the configuration repository, with
separate discovery/filtering logic only where that improves testing. Register
the plugin in global OpenCode configuration and follow its existing symlink
layout. Preserve unrelated settings and existing uncommitted work.

## Verification

1. Test inventory additions/removals, upstream aliases, user exclusions,
   conservative unknown-model handling, valid empty lists, and malformed data.
2. Test timeout/failure fallback, endpoint-scoped cache reuse, and cleanup.
3. Validate loading with the installed OpenCode V2 version.
4. Compare the backend's effective Codex/Gemini inventory with a live proxy
   response, accounting for exclusions and non-chat models.
5. Confirm Desktop uses a plugin-enabled backend and receives the updated
   inventory; distinguish backend verification from an actual UI check.
6. Verify representative Codex and Gemini requests after activation.

## Acceptance

The selected proxy providers expose only eligible models advertised by the
last successful discovery. Changes propagate within five minutes while the
backend is running. Failed discovery preserves the last valid list. Desktop
and terminal clients using a plugin-enabled backend see the same inventory.

## Review status

The plugin approach is approved. This written specification is ready for user
review before implementation planning.
