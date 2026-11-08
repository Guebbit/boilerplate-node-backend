---
source: src/modules/orders/services/cancel-mail.ts
sha256: bd674a3506a26f899ec0c41a63e5039b7d65f67f4359352b3102c41eed10738f
generated_at: 2026-11-08T06:56:04.174883+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/cancel-mail.ts

## Purpose

Sends the buyer-facing email explaining why their order was canceled. Listens to the `order.canceled` domain event so that every cancellation path (manual, automatic, hold-expiry) produces the same buyer-visible explanation, and so the email is still dispatched even if a crash occurs between the DB commit and the send.

## Key elements

- **`mailOrderCanceled(payload)`** — Sole export. Accepts the `order.canceled` event payload (`orderId`, `refund`, `cause`). Looks up `CANCEL_CAUSES[cause].mail` to pick a template kind, then delegates to `mailBuyerOfOrder`. Three outcomes:
  - `kind === 'none'` → resolves immediately, no email sent.
  - `kind === 'reservation-expiry'` → skips bank-transfer orders (handled elsewhere); otherwise sends `cardHoldExpiredEmail`.
  - any other kind → sends `orderCanceledEmail` including the refund amount.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/orders/services/cancel.ts` | Reads `CANCEL_CAUSES` to map `cause` → mail kind. |
| `src/modules/orders/emails.ts` | Imports `cardHoldExpiredEmail` and `orderCanceledEmail` template builders. |
| `src/modules/orders/services/notify.ts` | Calls `mailBuyerOfOrder`, which fetches the order and invokes the callback with `(order, locale, name)`. |
| `src/infrastructure/adapters/mailer.ts` | Calls `enqueueEmail` to queue the final email. |
| `src/kernel/events.ts` | Imports `DomainEventMap` for the typed event payload. |
| `src/modules/orders/services/index.ts` | Barrel export; re-exports `mailOrderCanceled` for consumers. |

## Notes

- **Bank-transfer reservation expiry is *not* mailed here.** That deadline is owned by the `payments` module, which sends its own acknowledgement.
- `enqueueEmail` never rejects (it logs failures internally), so the `void enqueueEmail(...)` calls intentionally float without a `.catch`.
- The cause lives on the event, not on the cancel method, which is what guarantees uniform buyer messaging regardless of which code path triggered the cancellation.
