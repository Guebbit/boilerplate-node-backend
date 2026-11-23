---
source: src/modules/delivery/services/act.ts
source_sha256: 11a6f7a3ab748909306e864004e09cfea7c4f3bcd167a4e2db921cbd677b3718
context_sha256: 24c2199596d824fb0fdcea161e79f80946df2e8532947a178adb62c1978e7ec0
generated_at: 2026-11-22T04:52:27.059355+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/services/act.ts

## Purpose
Provides the transaction wrapper for delivery "acts" (ship, deliver, fulfill, hold, release, remainder cancel). Each act writes the fulfillment order or shipment, the order summary, any order status move, and outbox events together in one transaction. Refusals are decided before the first write, from the same snapshot the writes land in, and are thrown as `ActRefusal` to abort the transaction.

## Key elements
- `ActRefusal` – an `Error` subclass carrying a `reject: ResponseReject`. Its message lists the error codes.
- `refuse(status, code, messageKey)` – throws an `ActRefusal` with a 404, 409 or 422 reject built from an error code and a translated message. Returns `never`.
- `refuseMissing(messageKey)` – throws an `ActRefusal` with a 404 reject carrying a translated message and no error code.
- `ActResult<T>` – a discriminated union: `{ refused: false, value }` or `{ refused: true, reject }`.
- `runAct(work)` – runs `work(session)` inside `withTransaction`. On commit it calls `nudgeOutbox()` and resolves `{ refused: false, value }`. A thrown `ActRefusal` becomes `{ refused: true, reject }`. Any other error is rethrown, wrapped in an `Error` if it isn't one.
- `runActOrThrow(work)` – the same as `runAct`, but a refusal is rethrown as `ActRefusal`. It is meant for listeners, so the outbox sees the failure, retries it, and fires dead-letter alerts when retries run out.
- `readWithOrder(fulfillmentOrderId, session)` – reads the fulfillment order and its order inside the act's session. It refuses with a 404 (`delivery.fulfillment-order-not-found` or `delivery.order-not-found`) if either is missing. Returns `{ fulfillmentOrder, order }`.

## Relationships
- `src/infrastructure/runtime/database.ts`: `withTransaction` supplies the transaction and session.
- `src/kernel/outbox.ts`: `nudgeOutbox` wakes the relay after commit, because the events become visible to it only then.
- `src/infrastructure/http/response.ts`: `generateReject` and the `ResponseReject` type build and carry refusals.
- `src/infrastructure/i18n/index.ts`: `t` translates the message keys.
- `src/modules/delivery/repository.ts`: `fulfillmentOrderRepository` loads the fulfillment order inside the session.
- `src/modules/delivery/model.ts`: supplies the `FulfillmentOrderDocument` type.
- The sibling services (`cancel-remainder`, `cut`, `deliver`, `ensure`, `found`, `fulfill`, `holds`) are the acts and helpers that build on these exports. This file itself imports none of them.
- The order is loaded through the orders module (`@modules/orders`), which supplies the `OrderDocument` type.

## Notes
- Refusals must be thrown before the first write, inside the transaction. `ActRefusal` aborts it, and the door converts it back into a `ResponseReject`.
- `runAct` is for request handlers that answer a client. Use `runActOrThrow` from listeners, where a swallowed refusal would never be retried or reported.
- `readWithOrder` is meant to be the only read for acts that start from a fulfillment order, so the door needs no separate read.
- `nudgeOutbox` runs only on success, after commit.
- `src/infrastructure/adapters/logger.ts` and `src/infrastructure/i18n/context.ts` are not imported in the visible content.
