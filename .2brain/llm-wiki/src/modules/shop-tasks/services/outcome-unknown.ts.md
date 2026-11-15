---
source: src/modules/shop-tasks/services/outcome-unknown.ts
sha256: 3cb9a65a7baa052f6c9adb0f874cea12df68e6edc1a2f282f10b10e2d42359a0
generated_at: 2026-11-14T21:53:37.032962+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/services/outcome-unknown.ts

## Purpose

Registers the sink the idempotency middleware calls when a do-not-retry write (refund, ship, receive-stock, adjust-stock) started but never reported back. It resolves the stuck key's subject to a human-readable name and sends a one-time staff notification so the people who own that work can investigate.

## Key elements

- **`tellOutcomeUnknown(facts: OutcomeUnknownFacts)`** — the sole export. Resolves the subject, sends the notification, and never rejects (errors are logged and swallowed so the client's 409 is never delayed).
- **`OPERATIONS`** — a `Record<OutcomeUnknownOperation, OperationTelling>` mapping each of the four operations to its permission set, frontend page, and subject-naming resolver.
- **`isKnownOperation`** — type guard; if the operation string isn't one of the four, the function logs an error and no-ops.
- **`orderNamed(orderId)`** / **`productNamed(facts)`** — resolvers that turn a raw ID into `{ subjectId, subjectName }` (order number or product title), returning `undefined` if the record has been deleted.
- **`NamedSubject`** / **`OperationTelling`** — local interfaces shaping the notification payload and the per-operation configuration.

## Relationships

- **`src/infrastructure/http/middlewares/idempotency.ts`** — supplies the `OutcomeUnknownFacts` type and is the caller: its ledger invokes this module's registered sink when it finds a do-not-retry key with an unknown outcome.
- **`src/infrastructure/adapters/logger.ts`** — all three failure paths (unknown operation, deleted subject, notification write error) log via `logger.error`.
- **`src/infrastructure/http/frontend-link.ts`** — `FRONTEND_LINK_RULES.staffPages` provides the URL template for the deep link in the notification.
- **`src/modules/notifications/index.ts`** — `notificationsService.notifyStaff` is the delivery mechanism for the staff notice.
- **`src/modules/payments/index.ts`** — `paymentService.orderIdOf` resolves a payment ID to its order ID for the `refund` operation.
- **`src/modules/delivery/index.ts`** — `deliveryService.orderIdOfFulfillmentOrder` resolves a fulfillment-order ID to its order ID for the `ship` operation.
- **`src/modules/orders/index.ts`** — `orderService.findManyByIds` fetches the order number for display.
- **`src/modules/products/index.ts`** — `productService.findManyByIds` fetches the product title for display.
- **`src/modules/shop-tasks/staff-routing.ts`** — `SHOP_STAFF_ROUTES['shop-tasks.staff.outcome-unknown']` supplies the route key passed to the notification service.
- **`src/modules/shop-tasks/services/index.ts`** — barrel file through which this module is exported to the rest of the codebase.

## Notes

- **Fire-and-forget contract.** The function always resolves (never rejects) so the idempotency middleware's 409 response to the client is never blocked or failed by the notification step.
- **Deduplication** is handled downstream via `dedupeKey: outcome-unknown:${recordId}`; this module itself sends unconditionally when called.
- If the subject (order or product) has been deleted by the time the notice is composed, the notification is skipped and an error is logged — staff simply won't see it.
- The permission set on each `OPERATIONS` entry (`PaymentRefunding`, `DeliveryManagement`, `InventoryManagement`) determines *who* receives the notice; it is not a runtime check here.
