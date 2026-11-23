---
source: src/modules/orders/services/cancel-mail.ts
generated_at: 2026-11-22T06:19:00.314805+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/cancel-mail.ts

## Purpose
Sends the buyer an explanatory email after an order is canceled. It is meant to be called from the `order.canceled` event listener. The event's `cause` selects which mail to send (via `CANCEL_CAUSES[cause].mail`). This means every cancel path produces the same explanation. A crash between the commit and the send still results in the mail being sent.

## Key elements
- `mailOrderCanceled({ orderId, refund, cause })` — the only export. It takes the `order.canceled` payload and returns `Promise<void>`.
  - If the cause's mail kind is `'none'`, it resolves immediately and sends nothing.
  - If the kind is `'reservation-expiry'`, it sends `holdExpiredEmail(locale, order)`. It skips this when `order.paymentMethod === 'bank_transfer'`.
  - For any other kind, it sends `orderCanceledEmail(locale, name, order, order.orderNumber, refund)`. This mail tells the buyer what became of their money.
  - Emails are queued with `enqueueEmail({ to: order.email, subject }, template, data)`. The call is fire-and-forget (`void`).

## Relationships
- `src/modules/orders/services/cancel.ts` — supplies `CANCEL_CAUSES`, which maps each cause to a mail kind.
- `src/modules/orders/services/notify.ts` — `mailBuyerOfOrder(orderId, cb)` loads the order and calls the callback with `(order, locale, name)`.
- `src/modules/orders/emails.ts` — provides the `holdExpiredEmail` and `orderCanceledEmail` builders. Each returns `subject`, `template` and `data`.
- `src/infrastructure/adapters/mailer.ts` — provides `enqueueEmail`, which queues the message.
- `src/kernel/events.ts` — provides the `DomainEventMap['order.canceled']` payload type.

## Notes
- Bank-transfer expiry is deliberately not mailed here. The `payments` module owns the transfer's deadline and sends that mail itself.
- The `no-floating-promises` lint rule is disabled on the `enqueueEmail` calls. The inline comments say `enqueueEmail` never rejects and logs its own failures.
- A cause with its own acknowledgement, or with nobody to tell, should map to `'none'` so that nothing is sent.
