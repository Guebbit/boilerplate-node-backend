---
source: src/modules/orders/tests/factories.ts
sha256: 03ece1190ff2484984485d7a49b7b153027ca3acef4b8691ad58d028c057d553
generated_at: 2026-10-15T11:13:06.201511+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/factories.ts

## Purpose

Database-touching order factories for the orders test suite. While `../factories.ts` provides a pure in-memory builder (operating on data snapshots), this file wraps that builder around **real persisted Mongoose documents**, adds convenience seeds (`seedOrder`, `seedDigitalOrder`), and exposes direct repository/model helpers that tests use to assert on or force persisted state. It exists so integration and contract tests can create, inspect, and manipulate orders in the test database without driving full service flows.

## Key elements

- **`toOrderItem(product, quantity?, locale?)`** — Converts a persisted `ProductDocument` into an embeddable order-line snapshot. Spreads the full document (minus `_id`, `__v`, `taxClass`), resolves `taxClass` → `taxRate`, and stamps `preorder: true` when applicable. Mirrors `freezeOrderLines` semantics.
- **`makeOrder(user, items, extras?)`** — Delegates to the pure `buildOrder` in `../factories.ts`, filling in `userId`/`email` from a `UserDocument` and passing `extras` through verbatim (no shipping defaults).
- **`createOrder(user, items, extras?)`** — Calls `orderRepository.create(makeOrder(...))`; returns the hydrated `OrderDocument`.
- **`seedOrder(status)` / `seedDigitalOrder(status, paidAt?)`** — One-line orders for a fresh user + product, forced to a given status. Digital variant uses a `requiresShipping: false` product and optionally stamps `paidAt`.
- **`orderRepository`** (re-export) — The live repository instance, exported so sibling test files can `jest.spyOn` it to intercept calls made *inside* this module (a wrapper function cannot do this).
- **`readOrder` / `findOrder` / `countOrders` / `saveOrder`** — Thin passthroughs to `orderRepository` for raw DB assertions.
- **`forceOrderStatus(orderId, status)`** — Writes any status by passing all `OrderStatus` values to `updateStatusIfIn`, bypassing lifecycle guards. Test-only door for reaching unreachable states.
- **`detachOrderUserId(userId, anonymizeAfter)`** — `$unset`s `userId` and `$set`s an explicit `anonymizeAfter`, sidestepping the `createdAt`-derived clock in `orderRepository.detachUserId`.
- **`markOrderPaidAt(orderId, paidAt)`** — Directly stamps the internal-only `paidAt` field (not reachable via `OrderOverrides` or the wire).
- **`setWithdrawUntil(orderId, withdrawUntil?)`** — Sets or clears the frozen withdrawal deadline.
- **`timelineOf(orderId, typePrefix?)`** — Reads the order timeline as admin (`asAdmin`), optionally filtering by type prefix.
- **`lastOverrideOf(orderId)`** — Returns the last `status_overridden` timeline entry.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — Imports `toObjectId`, used in `detachOrderUserId` and `setWithdrawUntil` to convert string ids to Mongoose ObjectIds.
- **`src/modules/delivery/tests/factories.ts`** — Sibling factory file following the same "pure builder + DB wrapper" split within its own module.
- **Test files in `src/modules/{cart,delivery,account,addresses}/tests/…`** — Consumers of the factories and helpers exported here (e.g., `seedOrder`, `createOrder`, `readOrder`, `forceOrderStatus`) in their integration and contract suites.

## Notes

- `toOrderItem` deliberately spreads the entire product document rather than naming fields, so a new column on `ProductDocument` is carried into the snapshot automatically. The only exclusions are Mongo internals and `taxClass` (replaced by the resolved `taxRate`).
- `extras` in `makeOrder` is passed through, **not** defaulted. Shipping fields that are `undefined` stay `undefined`, preserving the "no method chosen" vs. "chose a free one" distinction in totals.
- `orderRepository` is re-exported specifically for `jest.spyOn` on the *live* object. A function wrapper around `orderRepository.create` would copy the call, not the binding, and could not intercept internal calls (e.g., the rollback path in `placeOrder`).
- `forceOrderStatus` is explicitly **not** a production path; `orderService` exposes no unconditional status writer. Use it only to craft a state the real API cannot produce, then assert a *different* caller handles it.
- `markOrderPaidAt` exists because `paidAt` is internal-only (omitted from the wire in `model.ts`), so no `OrderOverrides` key or API call can set it.
- `detachOrderUserId` uses `timestamps: false` to avoid side-effecting `updatedAt` on the many orders it touches.
