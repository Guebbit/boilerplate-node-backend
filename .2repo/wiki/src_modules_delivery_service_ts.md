# src/modules/delivery/service.ts

## Purpose

Service layer for the delivery module. It owns three responsibilities triggered by the order lifecycle: idempotent parcel creation and email notification when an order transitions to `shipped`, and the "fake courier" tick that moves all shipped parcels to `delivered`. It also exposes a read path for fetching a shipment and a static list of shipping methods. The file never mutates order status itself; it reacts to `ORDER_STATUS_CHANGED` and emits it back after courier delivery.

## Key elements

- **`trackingCodeFor(orderId)`** — Private. Derives a deterministic tracking code (`TRK-XXXXXXXX`) from the last 8 chars of the order ID. Re-shipping the same order yields the same code, supporting the upsert pattern.
- **`listMethods()`** — Returns the static `SHIPPING_METHODS` list wrapped in a success response. No auth, no DB.
- **`getForOrder(orderId, authContext?)`** — Resolves the caller's scope via `orderService`, verifies the order exists, then fetches the shipment by order ID. Returns 404 reject if either is missing.
- **`shipOrder(orderId)`** — Event handler for `ORDER_STATUS_CHANGED`. Upserts the shipment (idempotent), and on first creation only, looks up the user for locale/username, builds the email, enqueues it, and logs. Subsequent calls are no-ops for the email.
- **`runCourierAdvance(context)`** — The fake courier. Iterates all `shipped` shipments, conditionally moves each order `shipped → delivered` first, then stamps `deliveredAt` on the shipment (conditional to avoid double-stamping under a racing tick), emits `ORDER_STATUS_CHANGED`, and records an audit event. Returns the count of parcels delivered.
- **`deliveryService`** — Named export bundling the four functions above into a single handle. `shipOrder` is consumed via this module's own event subscription, not called directly by controllers.

## Relationships

- **`@infrastructure/i18n` (index/catalog/context)** — Imports `t` for user-facing error strings and `getDefaultLocale` as a fallback when the user record has no locale.
- **`@infrastructure/adapters/logger`** — Imports `logger`; writes `info` lines on shipment creation and courier advance (the log line is described as a contract).
- **`@infrastructure/adapters/mailer`** — Imports `enqueueEmail` (fire-and-forget, `void`ed) to dispatch the shipping notification email.
- **`@infrastructure/http/response`** — Uses `generateSuccess` / `generateReject` and their type aliases for all read-path returns.
- **`@infrastructure/http/request`** — Imports the `CallerContext` type for `runCourierAdvance`'s audit trail.
- **`@infrastructure/observability/audit`** — Calls `buildAuditEvent` + `emitAuditEvent` at the end of `runCourierAdvance`.
- **`src/modules/delivery/audit.ts`** — Imports `deliveryAuditActions.ADMIN_COURIER_ADVANCED` for the audit action key.
- **`src/modules/delivery/domain/index.ts`** — Imports `SHIPPING_METHODS` (the static catalog exposed by `listMethods`).
- **`src/kernel/events.ts`** — Calls `emitDomainEvent(ORDER_STATUS_CHANGED, …)` after each parcel is delivered in the courier tick.
- **Controllers (`get-shipment-by-order`, `get-shipping-methods`, `post-courier-advance`)** — Upstream callers that invoke `deliveryService.getForOrder`, `.listMethods`, and `.runCourierAdvance` respectively.
- **`@modules/orders` (orderService, orderRepository, ORDER_STATUS_CHANGED)** — `shipOrder` subscribes to the event; `getForOrder` delegates ownership checks to `orderService`; `runCourierAdvance` uses `orderRepository.updateStatusIfIn` for the conditional order move.

## Notes

- **Idempotency by design:** `shipOrder` checks `existing` before sending email, so an admin re-toggling `shipped` cannot spam the customer. The upsert in `shipmentRepository.upsertForOrder` is what makes the re-entrant case safe.
- **Order-before-shipment ordering:** In `runCourierAdvance`, the order status is moved first via a conditional write; the shipment stamp follows. A `null` return from the shipment conditional is expected under a concurrent tick and is *not* an error.
- **No scheduler:** `runCourierAdvance` is a plain function invoked behind an admin endpoint (the "fake courier"). There is no cron or queue in this repo.
- **`shipOrder` is not directly importable by controllers** — it is wired through the module's event subscription. The `deliveryService` handle exists so no caller needs to know which internal export to reach for.
- **Email locale fallback chain:** user record `locale` → `getDefaultLocale()`. The recipient address is always `order.email`, never the user record's.
