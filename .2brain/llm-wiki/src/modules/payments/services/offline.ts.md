---
source: src/modules/payments/services/offline.ts
sha256: a3e5de8fc6de052134cc65f0ecee915fc39cf1f01d86ba41f609da1ac37735d4
generated_at: 2026-09-23T19:21:30.925607+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/offline.ts

## Purpose

Records a payment that arrived outside the card provider (cash at the counter, bank transfer from a phone order) and routes it through the exact same `settlePayment` pipeline every card payment uses, so the order transitions `pending → paid`, stock commits, and the standard domain events fire without any branching logic.

## Key elements

- **`IN_FLIGHT_CARD_STATUSES`** (module-private `Set`) – the two card statuses (`requires_action`, `processing`) that still mean a charge could resolve at the provider; recording an offline payment while one of these is active would risk a double-charge.
- **`OfflinePaymentInput`** (exported interface) – the parsed admin request body: a non-card `method`, an optional `reference`, and an optional `receivedAt` ISO string.
- **`recordOfflinePayment`** (exported function) – the sole public API. Validates the input, loads the order, checks payability and in-flight card state, upserts the payment row, calls `settlePayment`, then records an audit entry and emits an analytics event before returning a `201` success or an appropriate `404`/`409`/`422` rejection.

## Relationships

- **`@modules/orders`** – calls `orderService.getById` to load the order, `isPayable` to ask the order lifecycle whether the current status accepts a payment, `orderTotal` for the amount, and `shopCurrency` for the currency code.
- **`../repository` (`paymentRepository`)** – `findByOrderId` to detect an existing card charge, and `upsertOffline` to write or update the offline payment row.
- **`./settlement` (`settlePayment`)** – performs the shared settlement (status flip, stock commit, event emission); this file is the offline entry point into that pipeline.
- **`./intent` (`resolvePayerId`)** – resolves the canonical payer identifier before the upsert.
- **`../audit` (`paymentsAuditActions`)** / **`../analytics` (`paymentsAnalyticsEvents`)** – supply the action/event name constants passed to `recordAudit` and `emitAnalyticsEvent`.
- **`@infrastructure/http/response`** – `generateSuccess` / `generateReject` shape every return value.
- **`@infrastructure/i18n`** – `t` supplies user-facing error and success messages.
- **`@infrastructure/observability/audit` / `@infrastructure/observability/analytics`** – `recordAudit` and `emitAnalyticsEvent` + `buildAnalyticsBase` log the operator action.

## Notes

- The order lookup is deliberately **unscoped** (no tenant/user filter) because this is an operator action gated by the `payments.any.create` permission at the route; a second identity parameter would be redundant.
- `isPayable` is imported from the orders domain rather than compared against a local literal, so this module cannot drift if the set of payable statuses changes.
- The upsert can return `null` if the order already moved past `pending` between the `isPayable` check and the write (a race); the function treats that as a `409` with the same `PAYMENT_ORDER_NOT_PAYABLE` code.
- `receivedAt` in the future is rejected with `422` before any order lookup occurs.
