---
source: src/modules/orders/services/scope.ts
sha256: 662c439308ad4e27d780ceef61c176757f31e96e7414c50393d68aec765bbb69
generated_at: 2026-10-15T11:10:47.459586+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/scope.ts

## Purpose

Defines the authorization boundary for order reads and writes. It answers the three questions every other order service asks before acting: **who may read which orders** (`callerScope`, `cancelScope`), **which lifecycle column applies** (`actorOf`), and **what actions the caller is offered on the wire** (the `*Actions` helpers). It centralises scope filtering and refusal logic so that individual services (cancel, fulfill, etc.) don't re-derive permission rules.

## Key elements

- **`callerScope(context?)`** — Returns a MongoDB-style filter for *read* scoping (own vs. all, soft-deleted or not) via `accessibleFilter`. Returns `{}` (never `undefined`) for unrestricted roles.
- **`cancelScope(authContext?, ownOnly?)`** — Returns the *write* scope for cancellation. Uses the `update` key, not the read key. For `ownOnly` (withdrawal) or a customer caller, restricts to the caller's own live orders.
- **`outrankedRefusalFor` / `outrankedOrderRefusal`** — Produce a `403 OUTRANKED` `ResponseReject` when the order's buyer ranks at or above the caller. The id variant loads the order first, unless the caller is system/absent.
- **`ownMoneyRefusalFor` / `ownMoneyOrderRefusal`** — Refusal for money-moving steps (record cash, refund, approve/receive return): the caller must not *be* the buyer, and the buyer must rank below the caller.
- **`ownerScope(userId)`** — Filter for one account's orders **including** soft-deleted rows (used by data-export paths).
- **`actorOf(authContext?)`** — Resolves the lifecycle column: `'system'` | `'admin'` | `'customer'`. Checks `isSystemActor` **before** any `holdsKey` call because `SYSTEM_ACTOR` carries an admin role internally.
- **`startAndOverrideActions`** *(internal)* — Computes `start` (delivery) and `override` (order-override targets) for the actions payload. Uses `ORDER_EVENTS.start.from` membership, not `canTransition`, to avoid echo-write false positives.
- **`withoutCancelOnceShipped`** *(internal)* — Strips `cancelled` from transitions and sets `cancel: false` once any fulfillment has shipped.
- **`canRecordPayment`** *(internal)* — Gates the offline "record a payment" button on `isPayable(status)` + `payments.any.create` key.
- **`holdsCheckout`** *(internal, truncated)* — Gates checkout-related actions on the caller holding the checkout key.

## Relationships

- **`@kernel/access/query` (`accessibleFilter`)** — The single source of "own AND still there" / "update-scope" filter compilation; both `callerScope` and `cancelScope` delegate to it.
- **`@kernel/permissions` (`callerForSubject`, `isSystemActor`)** — Resolves the caller's effective keys for a subject and identifies the system sweep actor.
- **`@kernel/ability` (`holdsKey`)** — Binary permission-key check used by `actorOf`, `startAndOverrideActions`, `canRecordPayment`, `holdsCheckout`.
- **`@modules/access` (`outrankedRefusal`, `ownMoneyRefusal`)** — The two refusal rule functions that `refusalOnOrder` / `refusalOnOrderId` dispatch to.
- **`../domain` (`orderActionsFor`, `ORDER_EVENTS`, `overridableTargetsFrom`, `isDigitalOnlyOrder`, `isPayable`, `canWithdraw`, `shipsAwaitedStock`, `OrderActor`)** — Domain logic for transitions, status rules, and actor typing that scope composes into wire actions.
- **`../repository` (`orderRepository`)** — Used by `refusalOnOrderId` to load an order by id before applying a refusal, and by `ownerScope` to build the filter.
- **`../model` (`OrderDocument`)** — Structural type for the `_id` / `userId` / `status` / `items` / `fulfillment` fields read throughout.
- **`../presenter` (`presentOrder`)** and **`./current` (`resolveCurrentImages`)** — Imported for assembling the final wire response (actions + images) in the (truncated) `withActions` path.
- **`@infrastructure/http/response` (`ResponseReject`)** — The typed 4xx rejection object returned by the refusal helpers.
- **`services/cancel.ts`** — Consumes `cancelScope` and the refusal helpers to authorise cancellation and withdrawal writes.

## Notes

- `callerScope` returns `{}`, never `undefined`. Both spread identically into a query, but `{}` is the honest "no conditions" shape and avoids a falsy-check pitfall at call sites.
- `cancelScope` deliberately keys off the **update** permission, not the read permission. A warehouse operator with `orders.any.read` but not `orders.any.update` can see every order yet cannot cancel any.
- `actorOf` checks `isSystemActor` **first**. Because `SYSTEM_ACTOR` internally carries `roles.tenant: 'admin'`, a `holdsKey(..., 'orders.any.update')` check alone would misclassify the reservation-sweep expiry as an admin and hand it the wider `cancelled` rule.
- `startAndOverrideActions` checks `ORDER_EVENTS.start.from.includes(status)` instead of `canTransition(status, target, 'system')`; the latter returns `true` for an echo write (status already equals target), which would incorrectly advertise `start: true` on an already-processing order.
- The `override` targets are further filtered by `shipsAwaitedStock` so no target that would 409 is ever offered.
- `refusalOnOrderId` skips the DB read entirely when `context` is absent or `context.caller.system` is true — no refusal is possible for those paths.
