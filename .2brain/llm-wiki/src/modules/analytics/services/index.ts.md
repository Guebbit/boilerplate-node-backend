---
source: src/modules/analytics/services/index.ts
sha256: c393cf78e5058cb1099f7d6061552252e1cb6977b7390d8b9a1de09affc80c04
generated_at: 2026-10-29T03:11:33.563889+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/services/index.ts

## Purpose

Barrel file that re-exports the analytics relay API as a single `analyticsService` object. It exists so that consumers (controllers, other modules) import from one well-known path rather than reaching into the `relay.ts` implementation directly.

## Key elements

- **`analyticsService`** (exported const) — an object with two members:
  - `registerBrowserEvents` — re-exported from `./relay`; registers which browser events the relay will accept.
  - `relayEvent` — re-exported from `./relay`; forwards a single event through the relay pipeline.
- Imports both functions from `./relay.ts`; no logic is added here.

## Relationships

- **`src/modules/analytics/services/relay.ts`** — sole implementation source; this file merely re-exports its two named functions.
- **`src/modules/analytics/module.ts`** — the NestJS module that declares/provides the relay so `analyticsService` can be injected into controllers.
- **`src/modules/analytics/controllers/post-analytics-event.ts`** — consumes `analyticsService.relayEvent` to forward incoming analytics payloads.
- **`src/modules/analytics/index.ts`** — module-level barrel that re-exports this service file for external importers.

## Notes

- The file contains no logic of its own; changes to relay behavior must be made in `relay.ts`.
- `analyticsService` is a plain object, not a class — there is no constructor, DI metadata, or decorator. Injection (if used) is handled upstream in `module.ts`.
