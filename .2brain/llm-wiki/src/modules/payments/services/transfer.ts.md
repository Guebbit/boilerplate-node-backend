---
source: src/modules/payments/services/transfer.ts
sha256: 267dd44cbcf92351969756a9a16417b27a5fb8cf7884bdc754df33861efb4840
generated_at: 2026-10-29T05:14:21.393242+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/transfer.ts

## Purpose

Opens the payment record for an order placed with the `bank_transfer` method. Acts as the `order.created` event listener: when a transfer order is placed it inserts a `requires_action` row (carrying the RF reference, deadline, and wire instructions) and mails the instructions to the buyer. Downstream settlement (`settlePayment`) and operator recording (`./offline`) consume that row later.

## Key elements

- **`openTransferPayment(orderId)`** — sole export. Fetches the order, guards on `paymentMethod === 'bank_transfer'`, a `payBy` date, and payable status, then calls `paymentRepository.openTransfer`. If the row was newly created and the `bankTransferEnabled` feature flag is on, mails instructions via `mailTransferInstructions`. Idempotent under at-least-once delivery: re-delivery of `order.created` is a no-op because the insert is conditional on absence.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/index.ts` (barrel) | Imports `buyerIdOf`, `isPayable`, `orderService`, `orderTotal` |
| `src/modules/orders/services/index.ts` | Source of `orderService.getById` |
| `src/modules/orders/domain/lifecycle.ts` | Provides `isPayable` (status gate) |
| `src/modules/orders/domain/totals.ts` | Provides `orderTotal` (amount for the row) |
| `src/modules/payments/config.ts` | `bankTransferEnabled()` feature flag gates instruction mail |
| `src/modules/payments/domain/index.ts` | `buildReference(orderId)` — generates the RF reference stored on the row |
| `src/modules/payments/domain/transfer-reference.ts` | Underlying reference builder (re-exported via domain barrel) |
| `src/modules/payments/repository.ts` | `paymentRepository.openTransfer` — the actual insert |
| `src/modules/payments/services/notify.ts` | `mailTransferInstructions` — sends buyer instructions |
| `src/modules/payments/services/index.ts` | Re-exports this module's API |
| `src/infrastructure/adapters/logger.ts` | `logger.warn` when the row is opened but the feature is disabled |

## Notes

- **Row exists without instructions:** if `bankTransferEnabled()` is false at the moment `order.created` fires, the row is still inserted but no email is sent. Only a `logger.warn` is emitted. An operator must supply instructions manually.
- **Idempotency contract:** the "created" flag returned by `openTransfer` is the sole signal that the caller may proceed to mail. A duplicate event that finds an existing row (e.g. card paid first, or operator already recorded) returns early and sends nothing.
- The module doc comment references `docs/modules/payments.md#bank-transfer` for the broader flow (operator recording via `./offline`, settlement via `settlePayment`). Those are consumers of this row, not dependencies of this file.
