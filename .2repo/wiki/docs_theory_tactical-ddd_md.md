# docs/theory/tactical-ddd.md

## Purpose

Documents the two tactical DDD patterns this repo deliberately adopts (a lifecycle transition table and server-computed capability actions) and explicitly prices the patterns it does **not** adopt (aggregates, domain repositories, mappers, read models). Exists to justify the selective scope, prevent un-warranted expansion, and record the rationale for each structural choice so a reader can evaluate whether adding a third pattern clears the adoption bar.

## Key elements

- **Adoption decision flowchart** — three-question gate (duplicated? disagreeing? needs state?) that determines whether a rule earns a value type, a table, a single function, or an aggregate. Both patterns in the codebase clear the middle branch; nothing clears the aggregate branch.
- **Order lifecycle table** (documents `src/modules/orders/domain/lifecycle.ts`) — encodes which status may follow which and which actor (`system`, `customer`, `admin`) may make each move. Exposes `canTransition(from, to, actor)` and `statusesLeadingTo(target, actor)`.
- **Capabilities pattern** (section 2) — `Order.actions` and `PaymentActions` computed per-request from the caller's role, returned in the HTTP response so clients never re-implement the rules locally.
- **Compensation policy** — `order.cancelled` event carries a `refund` flag; forced to `true` for customers, operator-selectable for operators. The flag travels with the fact rather than being inferred by listeners.
- **Deciding vs. enforcing split** — the table in `lifecycle.ts` *decides* (which `from` set is legal); `updateStatusIfIn` in `repository.ts` *enforces* atomically via `findOneAndUpdate`. A refused move returns 409 with the allowed set before any field is written.

## Relationships

- **`docs/theory/strategic-ddd.md`** — linked as the "other half" of DDD (bounded contexts, ubiquitous language, context mapping) which this repo adopts wholesale. This file covers the tactical half selectively.
- **`TACTICAL_DDD_PLAN.md`** — the workspace-level document that prices the decision *not* to adopt aggregates, domain repositories, mappers, or a read model. Referenced twice as the authority for what is deliberately absent.
- **`src/modules/orders/domain/lifecycle.ts`** — the file this doc's section 1 describes in full: the transition table, the actor-per-edge convention, the four call sites, and the compensation flag semantics.
- **`src/modules/orders/domain/money.ts`** — contains the `Money` value object, one of the two "both live in `src/modules/orders/domain/`" patterns; a pure data type with invariant-bearing functions in front.
- **`src/modules/orders/domain/totals.ts`** — contains `sumLineItems` and `priceShipping`, the single-function examples that cleared the "one function, one owner" branch of the adoption flowchart.
- **`docs/theory/domain-layer.md`** — the broader domain-layer context (module boundaries, the `domain/` subfolder convention) within which these tactical patterns are situated.

## Notes

- The adoption bar is intentionally narrow: "is the rule already duplicated, **and** do the copies disagree?" Adding a pattern without both conditions is explicitly discouraged; the flowchart is the gate, not a suggestion.
- `update` refuses `cancelled` outright (`ORDER_CANCEL_VIA_CANCEL_ENDPOINT`). Cancellation is a sequence (release hold → emit event → refund), not a field write. `POST /orders/{id}/cancel` is the only path that executes it, for every actor.
- `update` also refuses to rewrite `items` while stock is held (`ORDER_ITEMS_HELD`) because the reservation froze its own copy of the basket.
- `system` is not a privilege *above* `admin`; it is *narrower* — moves that require an external fact (money landing) before any human may act. Only `pending → paid` is `system`-only today.
- The refund flag is **overwritten** to `true` for customers, not trusted from the request body, because `paid` is cancellable on the promise that money returns.
- A standalone refund (`POST /payments/order/{orderId}/refund`) lives in `payments`, not `orders`, because `payments` already depends on `orders`; the reverse would create a cycle the module registry rejects at boot.
