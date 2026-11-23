---
source: src/modules/analytics/index.ts
source_sha256: e4a3c8da588b0bb0de03f65c2c0e587f5aec78f7cf00e57420f63f71cf308e8d
context_sha256: 5b83c6aff06721716a7264a7c35d7d87b2d8dcfd202a174553da8ce851ad441d
generated_at: 2026-11-22T04:17:45.962014+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/analytics/index.ts

## Purpose
Public barrel for the analytics module. It is the only surface that sibling modules may import from this module, and it publishes only the relay service. The module's internal wiring (`module.ts`, `routes.ts`, `controllers/`) is deliberately not exported.

## Key elements
- `export * from './services'` — the single statement in the file. It re-exports everything the services barrel exposes, which the file's doc comment describes as the analytics relay service.

## Relationships
- `src/modules/analytics/services/index.ts` — the only dependency. This barrel re-exports its public API wholesale, so the exported surface is whatever that file exports.
- The doc comment says the provider port the relay feeds lives in `infrastructure/observability/analytics`. This file does not import it.

## Notes
- Because of the `export *`, anything newly exported from the services barrel becomes part of the module's public surface automatically. Keep it limited to what should be published.
- Sibling modules should import from this barrel, not from `services/`, `controllers/`, or other internals.
- The doc comment references two documentation pages (an analytics module page and a strategic-DDD page, section "the barrel") for the module's neighbourhood and the barrel rule; neither is part of this repository.
