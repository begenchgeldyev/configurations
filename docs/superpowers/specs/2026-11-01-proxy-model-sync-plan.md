# Implementation plan

The design was approved on 2026-11-01.

1. [x] Inspect the installed V2 plugin contract, live model definitions, and Desktop
   backend connection. Resolve provider settings without exposing credentials.
2. [x] Implement inventory validation and a model transform that preserves existing
   aliases/metadata/exclusions and safely adds new text model IDs.
3. [x] Implement startup discovery, five-minute refresh, endpoint-scoped persistent
   cache, bounded requests, sanitized errors, and shutdown cleanup.
4. [x] Test filtering, additions, empty responses, cache isolation, failures,
   cancellation, and refresh using Node's built-in test runner.
5. [x] Register the local plugin globally, reload OpenCode, and inspect plugin and
   model API results. Verify actual proxy requests for Codex and Gemini.
6. [x] Document installation, Desktop behavior, and the verification results.
