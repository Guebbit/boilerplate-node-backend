---
source: src/modules/orders/services/cancel-mail.ts
sha256: 89050f41b82a8f8bf9b7bbb11c54e71dffe9e91e4411356e01c623b27edbcdc7
generated_at: 2026-10-29T04:45:41.771614+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/cancel-mail.ts

## Purpose

Sends the buyer-facing cancellation email in response to the `order.cancelled` domain event. The cause carried on the event selects which email template to use, so every code path that cancels an order produces the same buyer-facing explanation, and the email is still dispatched if a crash occurs between the database commit and the send.

## Key elements

- **`mailOrderCancelled`** (exported) — Receives the `order.cancelled` event payload (`orderId`, `refund`, `cause`). Looks up `CANCEL_CAUSES[cause].mail` to determine the mail kind, then delegates to `mailBuyerOfOrder` to fetch the order and send the appropriate template. Returns a resolved promise immediately when the kind is `'none'`.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Supplies `enqueueEmail`, the async transport that actually delivers the message.
- **`src/kernel/events.ts`** — Provides the `DomainEventMap` type used to type the event payload.
- **`src/modules/orders/emails.ts`** — Supplies the two template builders: `orderCancelledEmail` (general cancellation / refund) and `cardHoldExpiredEmail` (card-hold expiry).
- **`src/modules/orders/services/cancel.ts`** — Supplies `CANCEL_CAUSES`, the enum-like map that associates each cancellation cause with its mail kind (`'none'`, `'reservation-expiry'`, or the default cancellation mail).
- **`src/modules/orders/services/notify.ts`** — Supplies `mailBuyerOfOrder`, a helper that loads the order, resolves locale/name, and invokes the caller's send callback.
- **`src/modules/orders/services/index.ts`** — Re-exports this module so it is reachable from the services barrel.

## Notes

- Bank-transfer reservation expiry is **not** mailed here; that deadline is owned by the `payments` module.
- Causes whose `CANCEL_CAUSES` entry has `mail: 'none'` (e.g., a cause with its own acknowledgement, or one with no buyer to notify) result in no email at all.
- `enqueueEmail` never rejects — it logs its own failure internally — which is why the calls use `void` + a floating-promise eslint disable rather than `await`.
- The function is idempotent in intent: it is wired as an event listener, so the event bus is the single trigger point, not each individual cancel call-site.
