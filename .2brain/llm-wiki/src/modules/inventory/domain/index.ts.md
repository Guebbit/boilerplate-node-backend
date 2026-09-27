---
source: src/modules/inventory/domain/index.ts
sha256: 0dad810b296957f702d20dafd3f789813337478340c69b3cbb676c6076054048
generated_at: 2026-09-27T14:55:07.595426+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/index.ts

## Purpose

Barrel (re-export) file for the inventory **domain layer**. It gives the rest of the module a single import path for the pure business rules—specifically the reason→delta transition table—while keeping those rules free of Express, Mongoose, or any other tier dependency.

## Key elements

- **`counterDeltaFor`** (function) — re-exported from `./transitions`. Computes the counter delta for a given inventory-reason input.
- **`CounterDelta`** (type) — re-exported from `./transitions`. The shape describing the resulting delta.

## Relationships

- **`src/modules/inventory/domain/transitions.ts`** — sole source of the two re-exports; this file adds no logic of its own.
- **`src/modules/inventory/index.ts`** — consumes the domain barrel so higher-tier modules (service, repository) can import `counterDeltaFor` / `CounterDelta` without reaching into `domain/transitions` directly.
- **`src/modules/inventory/service.ts`**, **`src/modules/inventory/repository.ts`** — sit above the domain layer and rely on the types/rules re-exported here.
- **`src/modules/inventory/tests/unit/transitions.test.ts`** — tests the underlying `transitions.ts` module that this barrel surfaces.

## Notes

- This file is intentionally **logic-free**: it only re-exports. All behavior lives in `./transitions.ts`.
- The module doc comment draws a hard boundary: the *rule* (reason → delta) belongs in `domain/`; the *conditional write*, ledger-row creation, and HTTP envelope belong in upper tiers. When adding new inventory rules, place them here, not in `service.ts` or `repository.ts`.
- See `docs/theory/domain-layer.md` for the layering rationale referenced in the header comment.
