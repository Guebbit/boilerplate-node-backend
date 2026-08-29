# src/modules/delivery/service.ts

## Purpose

Service layer for the delivery module. It reacts to the order status machine (rather than driving it) to create parcels, mint tracking codes, send notification emails, and simulate courier delivery. It is the single handler behind the `ORDER_STATUS_CHANGED` → `shipped` transition and the manual "courier advance" job.

## Key elements

- **`trackingCodeFor(orderId)`** — derives a deterministic tracking code (`TRK-<last 8 of orderId, upper>`) so re-shipping re-mints the same code (safe for upsert).
- **`listMethods()`** — returns the static `SHIPPING_METHODS` array; always a 200.
- **`getForOrder(orderId, authContext?)`** — resolves the shipment for an order, enforcing order-level ownership scoping via `orderService.callerScope`.
- **`shipOrder(orderId)`** — idempotent `ORDER_STATUS_CHANGED` listener: upserts the shipment, sends the locale-aware "shipped" email only when the parcel is new, logs the outcome.
- **`runCourierAdvance(context)`** — the fake-courier tick. For every `shipped` shipment, conditionally moves the order to `delivered` first, then conditionally stamps the shipment's `deliveredAt`. Emits `ORDER_STATUS_CHANGED` per parcel, writes an audit event, returns the count advanced.
- **`deliveryService`** — the module's public handle bundling all four functions above; controllers import this single object.

## Relationships

- **`src/infrastructure/i18n/*`** (`index`, `catalog`, `context`) — `t()` supplies user-facing strings; `getDefaultLocale()` provides the fallback when a user record is missing.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` dispatches the "shipped" notification.
- **`src/infrastructure/adapters/logger.ts`** — `logger.info` records the shipment creation and courier-advance summary.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape every API response from this file.
- **`src/infrastructure/http/request.ts`** — `CallerContext` type parameterised on `runCourierAdvance`.
- **`src/infrastructure/observability/audit.ts`** — `emitAuditEvent` / `buildAuditEvent` write the admin audit trail for courier advance.
- **`src/kernel/events.ts`** — `emitDomainEvent` announces each `shipped → delivered` transition back to subscribers.
- **`src/modules/delivery/audit.ts`** — `deliveryAuditActions.ADMIN_COURIER_ADVANCED` provides the stable action identifier for the audit event.
- **`src/modules/delivery/domain/index.ts`** (and `domain/rates.ts`) — source of the `SHIPPING_METHODS` constant consumed by `listMethods`.
- **`src/modules/delivery/controllers/get-shipment-by-order.ts`** — calls `deliveryService.getForOrder`.
- **`src/modules/delivery/controllers/get-shipping-methods.ts`** — calls `deliveryService.listMethods`.
- **`src/modules/delivery/controllers/post-courier-advance.ts`** — calls `deliveryService.runCourierAdvance`.

## Notes

- **No scheduler by design.** `runCourierAdvance` is a plain job function exposed behind an admin endpoint; an operator or demo click acts as the cron trigger. Do not expect automatic invocation.
- **Idempotency of `shipOrder`.** The `existing` check before enqueuing the email means an admin re-triggering the same status change will not re-notify the customer.
- **Two-phase conditional write in `runCourierAdvance`.** The order is moved to `delivered` *before* the shipment is stamped. A race between two concurrent ticks is resolved by the `updateStatusIfIn` filter on the shipment: the first tick to read `shipped` wins the stamp, the second gets `null` (no-op). The `advanced` counter still increments on the order transition, not on the shipment write, so the count reflects "orders delivered" not "shipment rows touched."
- **Ownership is inherited from the order.** A shipment carries no independent `ownerId`; `getForOrder` delegates visibility to `orderService.callerScope`.
- **Email locale fallback chain:** `user.locale → getDefaultLocale()`. The recipient address is always the order's `email` field, not the user profile's.
