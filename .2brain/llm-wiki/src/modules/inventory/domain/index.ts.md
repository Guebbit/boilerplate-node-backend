---
source: src/modules/inventory/domain/index.ts
sha256: 8df03fa15ef71802bf5616af9683cf52041587d64e5b7d307acad13acd65baa3
generated_at: 2026-10-29T04:00:14.323448+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/index.ts

## Purpose

Barrel file for the inventory **domain layer**. It re-exports the pure business rules (counter-delta computation and hold-line manipulation) so that consumers can import them from a single path. The layer is explicitly lint-guaranteed free of Express, Mongoose, and any persistence or transport concern—every export is a rule testable without a database.

## Key elements

- **`counterDeltaFor`, `roomOn`** (re-exported from `./transitions`) — functions that compute the reason→delta table for inventory counters.
- **`CounterDelta`, `HoldKind`** (re-exported from `./transitions`) — types describing a counter change and the kind of hold involved.
- **`takeFromHold`, `withAdded`** (re-exported from `./hold-lines`) — pure functions that mutate/derive `HoldLine` values (remove a take, add a line).
- **`HoldLine`, `HoldTake`** (re-exported from `./hold-lines`) — types for individual hold entries and the "take" sub-record.

No logic lives here; the file is a flat re-export surface.

## Relationships

- **Re-exports from `./transitions` and `./hold-lines`** — these two files are the sole sources of every symbol this index exposes.
- **Consumed by `src/modules/inventory/index.ts`** — the module-level barrel pulls the domain surface up so services and the public API can import from a single entry point.
- **Used by services (`services/holds.ts`, `services/levels.ts`, `services/reserve.ts`, `services/top-up.ts`, `services/transition.ts`)** — these apply the pure delta/hold rules and then perform the conditional writes and ledger bookkeeping that the domain layer deliberately omits.
- **Tested indirectly via `tests/unit/transitions.test.ts` and `tests/unit/hold-lines.test.ts`** — the unit tests target the two source files directly; this barrel file has no independent test.

## Notes

- The header comment (`@module`) and the reference to `docs/theory/domain-layer.md` define the contract: anything that touches a DB, HTTP envelope, or Mongoose model does **not** belong in this directory.
- Because this is a re-export-only file, adding a new domain rule means creating or extending one of the two source files, then adding the export line here—there is no logic to edit in this file itself.
