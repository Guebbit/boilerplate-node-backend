# src/modules/inventory/domain/index.ts

## Purpose

Barrel (re-export) file for the inventory **domain layer**. It exposes the pure business rules — specifically the reason→delta table and availability logic — to the rest of the codebase while keeping the domain free of Express, Mongoose, and any other tier. Consumers import from this file rather than reaching into `./transitions` directly.

## Key elements

- **`counterDeltaFor`** (re-exported from `./transitions`) — Given a reason, returns the delta that should be applied to a counter (the core reason→delta mapping).
- **`availabilityOf`** (re-exported from `./transitions`) — Derives the availability status from the current counter state.
- **`CounterDelta`** (type, re-exported from `./transitions`) — The shape of the delta object produced by `counterDeltaFor`.

## Relationships

- **`src/modules/inventory/domain/transitions.ts`** — Sole source of every symbol this file re-exports. All runtime and type definitions live there; this file adds no logic.
- **`src/modules/inventory/index.ts`** — Module-level barrel that likely re-exports from this domain index, giving external consumers a single import path.
- **`src/modules/inventory/service.ts`** — Application-tier service that calls `counterDeltaFor` / `availabilityOf` to compute state changes before performing persistence (the "conditional writes" the header excludes from the domain).
- **`src/modules/inventory/tests/unit/transitions.test.ts`** — Unit tests targeting the `transitions` module directly; they exercise the same functions this index exposes.

## Notes

- This file is **export-only** (no own logic). If you need to change behavior, edit `transitions.ts`, not here.
- The header comment explicitly draws the domain boundary: anything involving writes, ledger rows, or HTTP envelopes belongs *outside* this directory (see `docs/theory/domain-layer.md`). Lint enforces the absence of framework imports in this folder.
- Importers should prefer this index path (`domain/index` or the module barrel) over `domain/transitions` to respect the layering contract.
