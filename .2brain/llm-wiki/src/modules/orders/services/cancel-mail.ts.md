---
source: src/modules/orders/services/cancel-mail.ts
sha256: 2bf883197644ad9397ff1cda01c7a77feba312653c2dd8ebe546e6abbf3a678a
generated_at: 2026-11-14T20:42:12.630129+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/cancel-mail.ts

## Purpose

Handles the buyer-facing email that explains why their order was canceled. It is invoked from the `order.canceled` domain-event listener so that every cancellation path (regardless of origin) produces the same explanation, and a crash between the DB commit and the send still results in the email going out.

## Key elements

- **`mailOrderCanceled(payload)`** — Sole export. Accepts the `order.canceled` event payload (`orderId`, `refund`, `cause`). Resolves the mail kind via `CANCEL_CAUSES[cause].mail`, then:
  - Returns immediately if kind is `'none'` (no acknowledgement owed, or no buyer to reach).
  - For `'reservation-expiry'`: skips `bank_transfer` orders (see Notes) and sends `holdExpiredEmail`.
  - Otherwise sends `orderCanceledEmail`, including the `refund` detail the buyer cannot see themselves.
  - Delegates buyer/locale/name lookup to `mailBuyerOfOrder` and enqueues via `enqueueEmail`.

## Relationships

- **`src/modules/orders/services/cancel.ts`** — Provides `CANCEL_CAUSES`, the mapping from each cancellation cause to its mail kind and description.
- **`src/modules/orders/emails.ts`** — Provides the two email templates: `orderCanceledEmail` and `holdExpiredEmail`.
- **`src/modules/orders/services/notify.ts`** — Provides `mailBuyerOfOrder`, which resolves the buyer's order record, locale, and name, then invokes this file's callback.
- **`src/infrastructure/adapters/mailer.ts`** — Provides `enqueueEmail`, the transport that actually dispatches the message.
- **`src/kernel/events.ts`** — Supplies the `DomainEventMap` type so the event payload is typed against the canonical event schema.
- **`src/modules/orders/services/index.ts`** — Re-exports `mailOrderCanceled` for external consumers of the orders services barrel.

## Notes

- **Bank-transfer expiry is deliberately not mailed here.** The `payments` module owns the transfer deadline and sends its own expiry notice; including it here would double-mail.
- `enqueueEmail` never rejects — it logs its own failure internally. The `void` + eslint suppression for floating promises is intentional, not an oversight.
- The `kind === 'none'` branch returns a resolved promise (not `undefined`) so callers can uniformly `await` or `.catch()` the result.
