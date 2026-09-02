# src/modules/delivery/service.ts

## Purpose

Business-logic service for the delivery module. It handles shipment creation on `ORDER_STATUS_CHANGED`, exposes the shipping-methods list for checkout, reads a single shipment for an order (ownership-scoped), runs the "fake courier" tick that advances all shipped parcels to delivered, and provides a batch read for the account data export. The module never moves an order to `shipped` itself — it reacts to the order's status machine.

## Key elements

- **`trackingCodeFor(orderId)`** — derives a deterministic tracking code (`TRK-<last 8 chars uppercase>`) from the order ID. Re-shipping the same order yields the same code, matching the upsert.
- **`listMethods()`** — returns the static `SHIPPING_METHODS` array from the domain as a success response for the checkout selector.
- **`getForOrder(orderId, authContext?)`** — looks up the order (scoped via `orderService.callerScope`), then the shipment. Returns 404 rejects with localized messages if the order or shipment is missing.
- **`shipOrder(orderId)`** — idempotent listener for `ORDER_STATUS_CHANGED`. Upserts the shipment (no duplicate email on re-trigger), resolves the user's locale/username for the email template, enqueues the shipment email via `enqueueEmail`, and logs.
- **`runCourierAdvance(context)`** — the fake-courier tick. Iterates all shipped shipments, conditionally moves each order `shipped → delivered` (one-winner race), stamps `deliveredAt` on the shipment, emits `ORDER_STATUS_CHANGED` domain event per parcel, and emits a single audit event with the count. Returns the number of parcels delivered.
- **`findShipmentsForOrders(orderIds)`** — batch read of shipments by order IDs, intended for the account export service. Not on the `deliveryService` handle.
- **`deliveryService`** — the module's single exported handle exposing `listMethods`, `getForOrder`, `shipOrder`, `runCourierAdvance`.

## Relationships

- **`@infrastructure/http/response`** — shapes all controller-facing return values via `generateSuccess` / `generateReject`.
- **`@infrastructure/http/request`** — `CallerContext` type is the parameter of `runCourierAdvance`.
- **`@infrastructure/i18n`** — `t()` provides localized error strings; `getDefaultLocale()` supplies a fallback locale for the shipment email when no user record exists.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` sends the "your parcel has shipped" notification.
- **`@infrastructure/adapters/logger`** — structured info logs for ship and courier-advance operations.
- **`@infrastructure/observability/audit`** — `emitAuditEvent` / `buildAuditEvent` record the admin courier-advance action.
- **`@kernel/events`** — `emitDomainEvent` broadcasts `ORDER_STATUS_CHANGED` after each parcel is delivered.
- **`./audit`** — `deliveryAuditActions.ADMIN_COURIER_ADVANCED` supplies the audit action identifier.
- **`./domain`** — `SHIPPING_METHODS` static catalog returned by `listMethods`.
- **`@modules/orders`** — `orderService` / `orderRepository` provide scoped order reads, `updateStatusIfIn` for the conditional move, and the `ORDER_STATUS_CHANGED` event constant.
- **`@modules/users`** — `userRepository.findById` resolves the user for locale/username in the shipment email.
- **`./repository`** — `shipmentRepository` handles upsert, find-by-order, find-all-shipped, and conditional status update.
- **`./model`** — `ShipmentDocument` type used throughout.
- **`src/modules/account/services/export.ts`** — consumer of `findShipmentsForOrders` for the account data export.
- **`src/modules/delivery/controllers/*`** — `get-shipment-by-order`, `get-shipping-methods`, and `post-courier-advance` invoke the corresponding `deliveryService` methods.

## Notes

- **Idempotency:** `shipOrder` uses `shipmentRepository.upsertForOrder`; if a shipment already exists it skips the email and returns early. An admin re-triggering the status change will not re-notify the customer.
- **Race safety in `runCourierAdvance`:** the order is moved first via a conditional `updateStatusIfIn`; only if that succeeds is the shipment stamped. A concurrent second tick will see `null` from the shipment update and simply not double-count.
- **`findShipmentsForOrders` is deliberately absent from `deliveryService`.** It is a narrow cross-module read for the account export, not part of the module's own subscription or admin surface. Import it directly by name.
- **`order.userId` may be absent** after an account detach; the code treats this the same as a lookup miss (null user) rather than an error.
- **No scheduler exists in this repo.** `runCourierAdvance` is a plain function invoked through an admin endpoint, not a cron job.
