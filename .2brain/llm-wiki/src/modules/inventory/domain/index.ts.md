---
source: src/modules/inventory/domain/index.ts
sha256: 328bd6ba23ec40c008b532b7079e48760c8c23bde53e00bb7edb2d5aa9f296b7
generated_at: 2026-10-15T10:34:35.112349+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/domain/index.ts

## Purpose

Barrel (re-export) file for the inventory domain layer. It provides a single import surface for the two pure-rule modules (`transitions` and `hold-lines`) so that upper layers (services, tests) can consume domain logic without reaching into individual files. The doc-comment enforces that nothing here may pull in Express, Mongoose, or any infrastructure tier.

## Key elements

- **`counterDeltaFor`** (re-exported function from `./transitions`) — resolves a reason code to its counter delta.
- **`CounterDelta`**, **`HoldKind`** (re-exported types from `./transitions`) — the delta shape and hold-classification enum/literal.
- **`takeFromHold`** (re-exported function from `./hold-lines`) — applies a "take" operation against a hold line.
- **`HoldLine`**, **`HoldTake`** (re-exported types from `./hold-lines`) — the line representation and the take descriptor.

## Relationships

- **→ `domain/transitions.ts`** and **→ `domain/hold-lines.ts`**: the sole source modules; this file imports nothing else and re-exports their public API.
- **← `services/holds.ts`**, **← `services/transition.ts`**, **← `services/types.ts`**: consume the re-exported functions/types for business-logic calls.
- **← `tests/unit/hold-lines.test.ts`**, **← `tests/unit/transitions.test.ts`**: import through this barrel to reach the tested modules.
- **← `src/modules/inventory/index.ts`**: the module-level entry point aggregates the domain barrel alongside model, repository, and service exports.

## Notes

- This file contains no logic of its own; it is purely a re-export surface. Adding a new domain module requires adding its exports here (or consumers import the leaf file directly).
- The doc-comment explicitly scopes what belongs in the domain layer vs. what does not (conditional writes, ledger rows, HTTP envelopes). Treat those exclusions as a lint/convention boundary.
- `HoldKind` and `HoldTake` are exported as **types only** (`export type`), so they are erased at compile time and cannot be used as runtime values from this barrel.
