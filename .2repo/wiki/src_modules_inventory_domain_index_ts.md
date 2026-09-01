# src/modules/inventory/domain/index.ts

## Purpose

Barrel file that defines the public API surface of the inventory **domain layer**. It re-exports two pure functions from `./transitions` so consumers can import domain rules from a single stable path without reaching into implementation files. It also serves as the lint-enforced boundary: anything imported through this path is guaranteed to be free of Express, Mongoose, and application-tier dependencies.

## Key elements

- **`counterDeltaFor`** (re-exported from `./transitions`) — derives the inventory counter delta for a given reason (the core "reason → delta" mapping).
- **`availabilityOf`** (re-exported from `./transitions`) — computes availability from domain state.
- **Module doc comment** — documents what belongs in the domain layer (pure, DB-free rules) and what does not (conditional writes, ledger rows, HTTP envelopes). Points to `docs/theory/domain-layer.md` for the broader rationale.

## Relationships

- **`src/modules/inventory/domain/transitions.ts`** — sole dependency; the two functions are defined there and re-exported here.
- **`src/modules/inventory/index.ts`** — module entry point that consumes this barrel to expose domain rules to the rest of the application.
- **`src/modules/inventory/service.ts`** — service-layer consumer that imports domain rules (via the module index) to apply pure calculations before issuing writes.
- **`src/modules/inventory/tests/unit/transitions.test.ts`** — unit tests exercise the functions that flow through this barrel's re-exports.

## Notes

- This file intentionally contains **no logic**; adding one here would blur the domain boundary.
- The doc comment enumerates what must *not* live in this directory (writes, ledger rows, HTTP envelopes). Lint rules enforce this, not convention.
- If a new pure rule is added to `transitions.ts`, it must be re-exported here to become part of the domain API; otherwise it stays internal to that file.
