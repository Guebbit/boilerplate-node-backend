---
source: src/modules/analytics/services/index.ts
source_sha256: c393cf78e5058cb1099f7d6061552252e1cb6977b7390d8b9a1de09affc80c04
context_sha256: 3809929bdc87e67c1082683e9b960a8368331cc47708d0270367d6d023809574
generated_at: 2026-11-22T04:18:23.062607+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/analytics/services/index.ts

## Purpose
Barrel file for the analytics module's services. It bundles the browser-event relay functions from `./relay` into a single `analyticsService` object, so the rest of the module has one entry point to the relay.

## Key elements
- `analyticsService`: exported constant object with two members:
  - `registerBrowserEvents`: re-exposed from `./relay`. Per the file's doc comment, it registers the events the relay accepts.
  - `relayEvent`: re-exposed from `./relay`. It is the browser-event relay itself.

## Relationships
- `src/modules/analytics/services/relay.ts`: the source of `registerBrowserEvents` and `relayEvent`. This file only re-exports them and adds no logic.
- `src/modules/analytics/controllers/post-analytics-event.ts`, `src/modules/analytics/module.ts` and `src/modules/analytics/index.ts` are graph neighbors, so they relate to this file through the dependency graph. The file content does not show how they use it, so no interaction is documented here.

## Notes
- This file contains no logic of its own. Behavior changes belong in `relay.ts`.
- Callers use `analyticsService.relayEvent(...)` rather than importing from `./relay` directly. The doc comment calls this object "the module's one door".
