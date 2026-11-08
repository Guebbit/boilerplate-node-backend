---
source: src/modules/inventory/domain/index.ts
sha256: 8df03fa15ef71802bf5616af9683cf52041587d64e5b7d307acad13acd65baa3
generated_at: 2026-11-08T05:58:37.409599+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/index.ts

## Purpose

Barrel file for the inventory domain layer. It re-exports the pure business rules (reason→delta logic and hold-line manipulation) under a single import path, so callers never need to reach into individual domain files. The doc comment enforces the tier boundary: this layer must remain free of Express, Mongoose, and all higher tiers.

## Key elements

- `counterDeltaFor`, `roomOn` (re-exported from `./transitions`) — compute the counter delta for a given reason and check remaining room.
- `CounterDelta`, `HoldKind` (types from `./transitions`) — structural types describing the delta result and hold classification.
- `takeFromHold`, `withAdded` (re-exported from `./hold-lines`) — manipulate hold-line entries (consume units / append a new entry).
- `HoldLine`, `HoldTake` (types from `./hold-lines`) — shape of a single hold line and the parameters for a take operation.

## Relationships

- **`./transitions.ts` / `./hold-lines.ts`** — the only two files this barrel re-exports from; it adds no logic of its own.
- **`src/modules/inventory/index.ts`** — the module-level barrel that re-exports this domain barrel (plus model, repository, services) to consumers outside the inventory directory.
- **`src/modules/inventory/services/*.ts`** (holds, levels, reserve, top-up, transition) — service-layer modules that import the domain rules through this barrel rather than importing the leaf files directly.
- **`src/modules/inventory/model.ts` / `repository.ts`** — the persistence tier that *applies* the domain rules (e.g. writing ledger rows) but does not re-export them; it depends on the domain types, not the other way around.
- **`src/modules/inventory/tests/unit/transitions.test.ts` / `hold-lines.test.ts`** — unit-test the leaf files in isolation, verifying the domain rules hold without a database.

## Notes

- This file contains **zero implementation**; it is purely `export … from` statements. Lint is expected to flag any import of Express, Mongoose, or a service/repository here.
- The doc comment's "Belongs here / Not here" split is the contract for where to put new logic: if it can be tested without a DB, it goes in `transitions.ts` or `hold-lines.ts` and is surfaced through this barrel; if it involves conditional writes or HTTP envelopes, it belongs in the services or model tier instead.
