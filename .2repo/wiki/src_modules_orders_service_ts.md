# src/modules/orders/service.ts

## Purpose

The order-service layer: all business logic for the Order entity. Controllers call exclusively into this file; it delegates raw database access to `orderRepository`, enforces domain rules (status transitions, line-item validation), coordinates inventory holds, and emits audit/analytics/confirmation side-effects. It is the single seam between HTTP handlers and the order domain.

## Key elements

- **`search(search, scope?, context?)`** — Paginated order search. Merges an optional `scope` filter into the `$match` stage and, when a `CallerContext` is supplied, emits an `orders_viewed` analytics event.
- **`getById(id, scope?)`** — Fetch one order by ID (optionally scoped, e.g. to a `userId`). Returns `undefined` on missing ID or not-found.
- **`recordCreated(order, context, actorRole?)`** — Shared "order was created" reporter: emits an audit event (`ORDER_CREATED`) and an analytics event. Called by both the admin `create` path and `@modules/cart` checkout.
- **`retractOrder(order, releaseHold)`** — Compensation for a failed write: optionally releases the inventory hold, then deletes the order document. Never rejects; each step is independently caught and logged.
- **`create(userId, email, items, context)`** — Full order-creation flow: resolves products, validates lines via `checkOrderLines`, writes the order, reserves stock, retracts on insufficient stock, records the creation, and enqueues the confirmation email. Returns `ResponseSuccess`/`ResponseReject`.
- **`update(order, data)`** — Admin partial update. Validates status transitions with `canTransition`, blocks `cancelled` moves (must use `cancelById`), guards line rewrites while stock is still bound, then persists.
- **`cancelById`** *(truncated in sample)* — The dedicated cancellation endpoint handler: releases the hold, emits `ORDER_CANCELLED` so `payments` can refund, and writes the status.

## Relationships

- **`src/infrastructure/http/response.ts`** — All public functions return `ResponseSuccess<T>` / `ResponseReject` built via `generateSuccess` / `generateReject`.
- **`src/infrastructure/i18n/index.ts`** — `t` for user-facing messages; `getDefaultLocale` as fallback for the confirmation email.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` fires the order-confirmation email in `create`.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` in `retractOrder`'s per-step catch handlers.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` + `buildAnalyticsBase` for `orders_viewed` and `order_created` events.
- **`src/infrastructure/observability/audit.ts`** — `emitAuditEvent` + `buildAuditEvent` for the `ORDER_CREATED` audit trail.
- **`src/infrastructure/persistence/create-repository.ts`** — `toObjectId` to coerce `userId` strings before writes.
- **`src/infrastructure/persistence/search.ts`** — `PaginatedMeta` type on the `search` return value.
- **`src/kernel/events.ts`** — `emitDomainEvent` for domain events (e.g. `ORDER_CANCELLED`, `ORDER_STATUS_CHANGED`).
- **`src/kernel/authorization.ts`** — `createOwnerScope` to build ownership-scoped query filters.
- **`src/infrastructure/http/request.ts`** — `CallerContext` type threaded through every write-path function.
- **`src/modules/cart/services/checkout.ts`** — Calls `recordCreated` and `retractOrder` as part of its checkout pipeline; the two modules share the "order was created" fact without sharing the email send.
- **`src/modules/cart/tests/integration/stock.test.ts`** — Integration tests that exercise the stock-reservation path through `inventoryService.reserveForOrder` invoked by `create`.

## Notes

- **Cancellation is exclusive to `cancelById`.** `update` returns a 409 (`ORDER_CANCEL_VIA_CANCEL_ENDPOINT`) if a caller attempts to set `status: 'cancelled'`, because cancellation is a multi-step sequence (release hold → emit `ORDER_CANCELLED` → write status) that only `cancelById` performs.
- **`recordCreated` is email-agnostic.** It only emits audit/analytics. The admin `create` path sends its own confirmation email; cart checkout sends its own. Adding an email send inside `recordCreated` would double-send on the checkout path.
- **`retractOrder` never rejects.** It is a compensation step; a failed cleanup must not surface as a 500 after the caller already received a 409. Errors are logged (with `error.message`, not the `Error` object, because the logger serialises to JSON and `Error` has no enumerable own properties).
- **Stock holds are order-keyed.** The order document must be written *before* `reserveForOrder` is called, because the hold references the order ID. This ordering is why `create` writes first, then reserves.
- **`async` is intentional on `create` and `update`.** `toObjectId` can throw synchronously on a malformed string; wrapping in `async` ensures the function rejects (promise rejection) rather than throws, keeping the error channel uniform with every other failure in the module.
- **Line rewrites are blocked while stock is bound.** `update` calls `inventoryService.isStockBoundToOrder` before persisting new `items`; if the shelf still holds units against the original basket, the write is refused with a 409.
