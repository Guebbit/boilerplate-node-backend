# src/modules/orders/domain/index.ts

## Purpose

Selective re-export (barrel) for the orders domain layer. It curates the public API surface of the three domain modules—`totals`, `rules`, and `lifecycle`—while deliberately omitting internal helpers that should not be consumed by outside code. It exists so callers import from a single entry point and the domain layer stays free of Express, Mongoose, and any upper-tier concerns.

## Key elements

- **`sumLineItems`, `orderTotal`** (from `./totals`) — compute line-item and order-level monetary totals.
- **`LineItem`, `LineItemTotals`, `OrderTotalInput`** (type re-exports from `./totals`) — input/output shapes for the totals functions.
- **`checkOrderLines`** (from `./rules`) — validates a set of order line candidates and returns a verdict.
- **`OrderLineCandidate`, `OrderLinesVerdict`** (type re-exports from `./rules`) — shapes for the rules check.
- **`canTransition`, `statusesReachableFrom`, `statusesLeadingTo`, `orderActionsFor`** (from `./lifecycle`) — query the order state machine for allowed transitions and actor-scoped actions.
- **`OrderActor`** (type re-export from `./lifecycle`) — identifies which role (e.g. customer, merchant) is performing an action.

## Relationships

- **`./totals`** — source of the `sumLineItems` / `orderTotal` functions and their types; this barrel is the only re-export point for them.
- **`./rules`** — source of `checkOrderLines` and its associated types.
- **`./lifecycle`** — source of the four transition/action functions and the `OrderActor` type.

## Notes

- **`toCents` is intentionally absent.** Its sole caller is `sumLineItems` inside `totals.ts`; re-exporting it here would signal that other modules may call it directly.
- **`ORDER_LIFECYCLE` is intentionally absent.** Consumers should call the named helpers (`canTransition`, `orderActionsFor`, etc.) rather than read the raw transition table, so the "why" of a decision stays in one place.
- The header comment defines the domain layer's boundary: anything testable without a database belongs here; queries, transactions, HTTP envelopes, and translated copy do not. See `docs/theory/domain-layer.md` for the full rationale.
