---
source: src/modules/payments/services/transfer.ts
sha256: 267dd44cbcf92351969756a9a16417b27a5fb8cf7884bdc754df33861efb4840
generated_at: 2026-11-08T07:30:01.924295+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/services/transfer.ts

## Purpose

Handles the payment-creation step for bank-transfer orders. When an order is placed with `paymentMethod: 'bank_transfer'`, this module opens a `requires_action` payment row (carrying the reference, deadline, and instructions) and mails the transfer instructions to the buyer. It exists so that the transfer payment is tied to the order lifecycle (`order.created`) rather than being created lazily at settlement time.

## Key elements

- **`openTransferPayment(orderId: string): Promise<void>`** — The sole export. Listens to `order.created`; validates that the order is a bank-transfer order with a `payBy` deadline and still payable; inserts the payment row via the repository; and, if the row was freshly created and the feature flag is on, mails instructions. Idempotent under at-least-once outbox delivery (insert only when absent; mail only on the inserting call).

## Relationships

- **`@modules/orders`** (`src/modules/orders/index.ts`) — Pulls in `orderService.getById`, `buyerIdOf`, `isPayable` (from `domain/lifecycle.ts`), and `orderTotal` (from `domain/totals.ts`) to read and validate the order.
- **`../repository`** (`src/modules/payments/repository.ts`) — Calls `paymentRepository.openTransfer` to insert the `requires_action` row; the repository returns a `created` flag used for idempotency.
- **`../domain`** (`src/modules/payments/domain/index.ts`) — Calls `buildReference` (implemented in `domain/transfer-reference.ts`) to generate the RF reference stored on the row.
- **`../config`** (`src/modules/payments/config.ts`) — Reads `bankTransferEnabled()` to decide whether to send instructions (feature-flag / deployment gate).
- **`./notify`** (`src/modules/payments/services/notify.ts`) — Calls `mailTransferInstructions(order, payment)` to deliver the wire instructions to the buyer.
- **`@infrastructure/adapters/logger`** — Emits a `logger.warn` when the row was created but the deployment no longer offers transfers (operator-facing visibility).
- **`src/modules/payments/services/index.ts`** — Re-exports this module so callers can import `openTransferPayment` from the services barrel.

## Notes

- The function is **fire-and-forget** (`Promise<void>`); callers (the outbox consumer) do not await a result. All error paths resolve to `undefined`.
- `bankTransferEnabled()` is checked **after** the insert, not before. This means a row is still created even when the flag is off, but no email is sent. The design intent is that the operator can still record the money manually on that row.
- If a payment already exists for the order (e.g., a card payment was recorded first, or an operator pre-filled it), the function is a silent no-op — it does not overwrite or log.
- The `created` flag on the repository result is the sole idempotency signal; do not rely on query-then-insert.
