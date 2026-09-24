---
source: src/modules/inventory/domain/index.ts
sha256: 36e7ba14eaf1baff95f45010d752555bf568fc2b72ee9985d9ac175fa45ea367
generated_at: 2026-09-23T18:44:16.453183+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/index.ts

## Purpose

Barrel file for the inventory **domain layer**. It re-exports the pure, tier-free business rules (the reason→delta table and availability logic) so that consumers import from a single stable entry point rather than reaching into individual domain modules.

## Key elements

- **`counterDeltaFor`** (re-exported from `./transitions`) — computes the counter delta for a given reason.
- **`availabilityOf`** (re-exported from `./transitions`) — derives availability from the current counter state.
- **`CounterDelta`** (type, re-exported from `./transitions`) — the shape of a reason→delta entry.

## Relationships

- **`domain/transitions.ts`** — sole source of every symbol re-exported here; this file adds no logic.
- **`src/modules/inventory/index.ts`** (module root) — consumes this domain barrel to expose rules upward to the service/repository tiers.
- **`repository.ts` / `service.ts`** — import the domain functions and types through this barrel (or through the module root that re-exports it) rather than importing `transitions.ts` directly.
- **`tests/unit/transitions.test.ts`** — exercises the same `transitions` module this barrel proxies; the barrel itself has no dedicated test.

## Notes

- The docstring explicitly scopes what *belongs* vs. *does not belong* in this layer: conditional writes, ledger rows, and HTTP envelopes live in the repository/service tiers, not here.
- A lint rule enforces the absence of Express/Mongoose imports in this directory; adding an I/O dependency here is a violation.
- Because this file is purely re-exports, any rename in `transitions.ts` must be mirrored here to avoid breaking downstream consumers that import via the barrel.
