# src/modules/orders/service.ts

## Purpose

Business-logic layer for the Order entity. Controllers call into this file exclusively; it orchestrates domain rules, inventory holds, audit/analytics emission, and confirmation mail, delegating all raw database access to `orderRepository`.

## Key elements

- **`search(search, scope?, context?)`** — Paginated order search (matches `POST /orders/search`). Emits an `orders_viewed` analytics event when a `CallerContext` is supplied.
- **`getById(id, scope?)`** — Single-order fetch; returns `undefined` for falsy IDs or missing documents.
- **`recordCreated(order, context, actorRole?)`** — Shared audit + analytics emission for "order created". Used by both the admin path and `@modules/cart`'s checkout so neither duplicates the event.
- **`retractOrder(order, releaseHold)`** — Compensation: optionally releases the inventory hold, then deletes the order document. Never rejects; logs each failed step via `logger.error` and moves on.
- **`create(userId, email, items, context)`** — Full creation: resolves products, validates lines via `checkOrderLines`, writes the order, reserves inventory (`reserveForOrder`), records audit/analytics, and enqueues the confirmation email. Returns `ResponseSuccess | ResponseReject`.
- **`update(order, data)`** — Admin field update (status, email, userId, items). Enforces status-transition rules via `canTransition`, blocks cancellation (must use the dedicated cancel endpoint), and refuses line rewrites while inventory is still bound to the order.

## Relationships

- **`@infrastructure/http/response`** — All return values are shaped through `generateSuccess` / `generateReject`; the `ResponseSuccess` / `ResponseReject` types are the public contract.
- **`@infrastructure/http/request`** — `CallerContext` type is the caller envelope passed into analytics, audit, and i18n lookups.
- **`@infrastructure/i18n` (catalog, context, index)** — `t` for user-facing messages; `getDefaultLocale` as fallback for the confirmation email's language.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` sends the order-confirmation email in `create`.
- **`@infrastructure/adapters/logger`** — `logger.error` is the sole signal of a failed compensation step in `retractOrder`.
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` / `buildAnalyticsBase` for `orders_viewed` and `order_created` events.
- **`@infrastructure/observability/audit`** — `emitAuditEvent` / `buildAuditEvent` for the `ORDER_CREATED` audit trail.
- **`@infrastructure/persistence/create-repository`** — `toObjectId` coerces string user IDs before writes; its rejection (not throw) is why `create`/`update` are `async`.
- **`@infrastructure/persistence/search`** — `PaginatedMeta` type on the `search` return value.
- **`@infrastructure/runtime/environment`** — `environmentNumber` imported (used in the truncated portion).
- **`@kernel/authorization`** — `createOwnerScope` for scope-building (truncated portion).
- **`@kernel/events`** — `emitDomainEvent` for domain events such as `ORDER_CANCELLED` (truncated portion).

## Notes

- **`retractOrder` is fire-and-forget by design.** Each step (release hold → delete document) is caught independently so a partial failure still logs and does not surface as a 500 to the caller.
- **`create` is `async` for a specific reason:** `toObjectId` must reject (not throw synchronously) so malformed IDs flow through the same promise chain as every other failure.
- **Confirmation email is path-specific.** `recordCreated` is shared with `@modules/cart` checkout (which sends its own mail), so `create` sends the email locally to avoid a double-send.
- **`update` deliberately excludes cancellation.** Cancellation is a multi-step sequence (release hold → emit `ORDER_CANCELLED` → payment refund) that lives in `cancelById`; attempting it here returns a 409 with a dedicated error code.
- **Line rewrites are blocked while inventory is bound.** `isStockBoundToOrder` is checked before any item mutation to prevent a later `commitForOrder` from decrementing products the order no longer contains.
