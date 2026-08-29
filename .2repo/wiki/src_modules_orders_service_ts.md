# src/modules/orders/service.ts

## Purpose
Business-logic layer for the Order entity. It validates state transitions, coordinates stock reservation, persists via the order repository, and fans out observability events (audit, analytics, domain events, mail). Controllers and cross-module callers (checkout, delivery) invoke these exports instead of touching the repository directly.

## Key elements
- **`search(search, scope?, context?)`** — Paginated order query (POST /orders/search). Applies filters (id, userId, productId, email) through `orderRepository.search`. Emits `orders_viewed` analytics only when a `CallerContext` is supplied (i.e. a real HTTP request, not a test or internal reuse).
- **`getById(id, scope?)`** — Single-order fetch. Returns `undefined` for falsy id or missing document. Accepts an optional scope for per-user restriction.
- **`recordCreated(order, context, actorRole?)`** — Shared "an order now exists" side-effect: emits the audit event and the `order_created` analytics event. Called from both the admin `create` path and the cart checkout path. `actorRole` is overridden to `'user'` by checkout so a purchase is always recorded as a customer action.
- **`create(userId, email, items, context)`** — Admin order creation. Validates lines via `checkOrderLines`, writes the order, then reserves stock through `inventoryService.reserveForOrder`. On stock failure it deletes the just-written order and returns a 409 with shortfall details. On success it calls `recordCreated` and sends the confirmation email (locale from `context.locale`, falling back to `getDefaultLocale()`).
- **`update(order, data)`** — Admin partial update. Enforces the domain transition table (`canTransition`), rejects cancellation (must go through the dedicated cancel endpoint), and blocks line-item edits while stock is still held for the order (`inventoryService.isStockBoundToOrder`). Status-only writes are applied; cancellation is deferred to `cancelById` (truncated).
- **`toObjectId`** (imported from `base-repository`) — Coerces user-supplied string IDs to MongoDB ObjectIds before writing. Malformed-id failure is the repository's concern, not this service's.

## Relationships
- **`@infrastructure/http/response`** — All return values are shaped through `generateSuccess` / `generateReject`; this file maps domain failures to HTTP status codes and structured error bodies.
- **`@infrastructure/http/request`** — `CallerContext` is the type threaded through `search`, `create`, and `recordCreated` to carry caller identity, locale, and audit metadata.
- **`@infrastructure/i18n`** (`catalog`, `context`, barrel) — Every user-facing message uses `t()`; `getDefaultLocale()` is the fallback for admin-created order mail.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` fires the order-confirmation email in `create` (admin path only; checkout sends its own).
- **`@infrastructure/observability/analytics`** — `emitAnalyticsEvent` + `buildAnalyticsBase` emit `orders_viewed` and `order_created` events.
- **`@infrastructure/observability/audit`** — `emitAuditEvent` + `buildAuditEvent` record `ORDER_CREATED` with actor role and target.
- **`@kernel/events`** — `emitDomainEvent` is imported for domain-event emission (used in the cancel/status-change paths visible in the truncated remainder).
- **`@kernel/authorization`** — `createOwnerScope` is imported for building scoped query filters (e.g. restricting an admin's view to a specific owner).
- **`@infrastructure/persistence/search`** — `PaginatedMeta` type shapes the `meta` field returned by `search`.
- **`@infrastructure/persistence/base-repository`** — Source of `toObjectId`; the single ObjectId-coercion helper used before writes.
- **`@modules/cart/services/checkout`** — Checkout calls `recordCreated` after its own stock/cart logic; the JSDoc on `recordCreated` documents this cross-module contract and the reason the mail send is *not* in `recordCreated`.
- **`@modules/delivery/service`** — Delivery workflow reads order status and drives transitions that this service's `update` / cancel paths must accept (visible through the `OrderStatus` enum and transition table shared via `./domain`).

## Notes
- **Cancellation is intentionally excluded from `update`.** The domain transition table allows admin → `cancelled`, but the service returns a 409 `ORDER_CANCEL_VIA_CANCEL_ENDPOINT` directing callers to `POST /orders/{id}/cancel`, which runs the full sequence (release hold → emit `ORDER_CANCELLED` → refund). This prevents a partial state where the order is "cancelled" but stock is still held.
- **Stock reservation is all-or-nothing per order.** `reserveForOrder` performs one conditional write per line; if any line cannot be covered the entire hold is rolled back and the just-created order document is deleted. The admin path deliberately reuses the same `inventoryService.reserveForOrder` as storefront checkout to prevent overselling.
- **`update` is `async` even though it looks synchronous.** `toObjectId(data.userId)` can throw on a malformed string; wrapping in `async` ensures the rejection surfaces as a rejected Promise rather than a synchronous throw escaping a `Promise<T>`-typed call site.
- **Mail locale for admin-created orders.** Unlike other mail in the codebase (which can read a recipient's stored preference), an admin-created order has no recipient record—only the supplied email address. The language therefore comes solely from `context.locale ?? getDefaultLocale()`.
- **`productId` search filter targets `items.product._id`.** Product data is embedded in the order document (snapshot pattern), not a reference; the repository's `searchable.objectIds` declares this once, and the service passes it through opaquely.
- **`recordCreated` is the single shared "order exists" side-effect.** It intentionally does *not* send mail, because checkout sends its own confirmation; putting mail here would double-send storefront orders.
