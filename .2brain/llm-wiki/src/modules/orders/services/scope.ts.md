---
source: src/modules/orders/services/scope.ts
sha256: 0a5b12974c6ffcc369be4aa20b274148ef807314dcc6b8887073a6fc9f5cb460
generated_at: 2026-09-27T15:16:03.475222+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/scope.ts

## Purpose

Defines the authorization boundary for order reads and per-order actions. Every other order service calls into this file before writing: `callerScope` narrows *which* orders a caller may see, `actorOf` picks *whose* lifecycle column applies, and `withActions` attaches the resulting action set to the wire response.

## Key elements

- **`callerScope(context?)`** — Returns a query filter (`Record<string, unknown>`) limiting reads to the caller's permitted orders via `accessibleFilter`. Returns `{}` (not `undefined`) for roles that read everything.
- **`ownerScope(userId)`** — Returns a filter for one account's orders by id, *without* excluding soft-deleted rows. Intended for callers that already know whose data they want (e.g. account data export).
- **`actorOf(authContext?)`** — Maps an `AuthContext` to a lifecycle actor (`'system' | 'admin' | 'customer'`). Checks `isSystemActor` first, then `orders.any.update` for admin.
- **`deliveryAndOverrideActions(status, digitalOnly, authContext)`** *(private)* — Computes the `start`/`ship`/`deliver`/`fulfill`/`override` action booleans based on the caller's own tenant-scoped keys and the order's current status.
- **`withActions(order, authContext?)`** — Produces the single-order wire response: the serialized `OrderDocument` plus its `actions` object and each line's resolved `current` images. The only `async` export in this file.

## Relationships

- **`@kernel/permissions`** (`callerForSubject`, `isSystemActor`) — Resolves the tenant-scoped caller subject and identifies the system actor before any role-based check.
- **`@kernel/ability`** (`holdsKey`) — Per-key permission lookups used by `actorOf` and `deliveryAndOverrideActions`.
- **`@kernel/access/query`** (`accessibleFilter`) — Sole source of the "own AND still there" read filter; `callerScope` is a thin wrapper.
- **`../domain`** (`orderActionsFor`, `statusesLeadingTo`, `overridableTargetsFrom`, `isDigitalOnlyOrder`, `OrderActor`) — Supplies lifecycle-table lookups and the digital-only classification that gate individual actions.
- **`../repository`** (`orderRepository`) — Backs `ownerScope`.
- **`../model`** (`OrderDocument`) — The Mongoose document type that `withActions` serializes.
- **`./current`** (`resolveCurrentImages`) — Async image lookup that makes `withActions` return a `Promise`.

## Notes

- **`actorOf` ordering is load-bearing.** `SYSTEM_ACTOR` carries `roles.tenant: 'admin'`; if the `holdsKey('orders.any.update')` check ran first, the reservation-sweep expiry would be misclassified as admin and receive the wider `cancelled` lifecycle rule (race B21). Always check `isSystemActor` before the key check.
- **`reachesVia` ≠ `canTransition`.** The private helper uses `statusesLeadingTo` (which excludes `from === to`) to avoid a true on an echo write where the order is already at the target status.
- **`fulfill` bypasses the lifecycle table.** For digital-only orders the `processing → delivered` move is gated directly on `status === OrderStatus.processing` because `delivery/service.ts#fulfillOrder` does not route through `ORDER_LIFECYCLE`.
- **`withActions` cast.** `order.toJSON()` is cast to `Order` because Mongoose's `Document['toJSON']` overload doesn't match the module-level `Order` contract; the same pattern is used in `products/service.ts`.
- **`callerScope` returns `{}`, never `undefined`.** Both spread identically into a query, but `{}` is the honest representation of "no conditions."
