---
source: src/modules/analytics/index.ts
sha256: 100850322387c22d65709ab313e601547dd5a4abd9d89aebfed9095ee8013010
generated_at: 2026-10-29T03:11:18.846167+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/index.ts

## Purpose
Public barrel (entry point) for the analytics module. It is the **only** surface a sibling module may import from, per the strategic DDD rule documented in `docs/theory/strategic-ddd.md` §5. Internally it simply re-exports the relay service; all other module-owned wiring (`module.ts`, `routes.ts`, `controllers/`) is deliberately excluded from the public API.

## Key elements
- **`export * from './services'`** — The sole statement. Re-exports the public relay service defined in `src/modules/analytics/services/index.ts`. This is the entire module's external API.

## Relationships
- **`src/modules/analytics/services/index.ts`** (dependency) — The sole re-export target. Every symbol a consumer sees from this barrel originates in that file.
- **`infrastructure/observability/analytics`** (consumer of the re-exported service) — The provider port that the published relay service feeds. Not a dependency of this file; rather, it is the downstream boundary the analytics module's output reaches.

## Notes
- This file is intentionally a one-liner. Adding more exports here would violate the barrel rule: internal wiring files must never be published through the barrel.
- The provider port is **not** re-exported from this barrel; consumers of the port import directly from `infrastructure/observability/analytics`.
- For deeper module context, see `docs/modules/analytics.md`.
