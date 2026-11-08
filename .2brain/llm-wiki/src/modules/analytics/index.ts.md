---
source: src/modules/analytics/index.ts
sha256: 100850322387c22d65709ab313e601547dd5a4abd9d89aebfed9095ee8013010
generated_at: 2026-11-08T04:58:43.754538+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/index.ts

## Purpose

Public barrel for the analytics module. It exists as the single, mandated import surface for any sibling module, enforcing the architectural rule (see `docs/theory/strategic-ddd.md` §5) that cross-module access goes only through the relay service and never through internal wiring (routes, controllers, module registration).

## Key elements

- `export * from './services'` — Re-exports every public symbol from `./services/index.ts`. This is the file's sole statement; it publishes the relay service surface and nothing else.

## Relationships

- **`src/modules/analytics/services/index.ts`** — Sole dependency. The barrel re-exports its entire public API, making whatever `services/index.ts` declares the de facto public contract of the analytics module to the rest of the codebase.
- **`infrastructure/observability/analytics`** (referenced in docblock) — The provider port that the relay service ultimately feeds. Not imported here; relevant as context for where analytics data flows.

## Notes

- **Import rule:** Sibling modules must import from this barrel, not from `./services`, `./routes`, `./controllers`, or any other internal path. Direct internal imports bypass the architectural boundary.
- **What is *not* published:** `module.ts`, `routes.ts`, and everything under `controllers/` are internal wiring and are deliberately excluded from this barrel. Adding them here would violate the module's public-contract intent.
- **Single source of truth for public API:** To discover what the analytics module exposes, read `src/modules/analytics/services/index.ts`; this file adds nothing.
