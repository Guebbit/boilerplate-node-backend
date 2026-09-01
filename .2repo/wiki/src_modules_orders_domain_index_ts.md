# src/modules/orders/domain/index.ts

## Purpose

Barrel (public API) for the **orders domain layer**. It exposes a curated, minimal set of pure rules—no Express, Mongoose, HTTP, or DB dependencies—so that consumers import a single entry point instead of reaching into individual rule files. It also encodes *what is off-limits* by intentionally omitting internal helpers.

## Key elements

- **`sumLineItems`, `orderTotal`** (re-exported from `./totals`) — the only arithmetic primitives exposed from the totals module.
- **`checkOrderLines`** (re-exported from `./rules`) — validation of order line items.
- **`canTransition`, `statusesReachableFrom`, `statusesLeadingTo`, `orderActionsFor`** (re-exported from `./lifecycle`) — state-machine queries over the order lifecycle.
- **`OrderActor`** (type, re-exported from `./lifecycle`) — the actor union used by the lifecycle functions.

## Relationships

- **`src/modules/orders/domain/totals.ts`** — source of `sumLineItems` and `orderTotal`. The barrel re-exports these two symbols and *nothing else* from that file.
- **`src/modules/orders/domain/rules.ts`** — source of `checkOrderLines`.
- **`src/modules/orders/domain/lifecycle.ts`** — source of the four lifecycle functions and the `OrderActor` type.

Downstream consumers (e.g. `src/modules/orders/index.ts`, `src/modules/orders/service.ts`) import from this file rather than from the individual sibling modules, keeping the dependency graph shallow.

## Notes

- **Deliberate omissions are load-bearing.** Two symbols that exist in sibling modules are *intentionally not* re-exported:
  - `toCents` (in `totals.ts`) — its only caller is `sumLineItems`; exposing it here would signal it is a general-purpose utility. Property tests reach it via `totals.ts` directly.
  - `ORDER_LIFECYCLE` (in `lifecycle.ts`) — callers are expected to use the named transition queries (`canTransition`, etc.) instead of reading the raw table.
- The module doc-comment states the design contract: anything testable without a database belongs in this layer; queries, transactions, HTTP envelopes, and translated copy do not. See `docs/theory/domain-layer.md` for the rationale.
