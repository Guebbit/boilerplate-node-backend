---
source: src/modules/orders/services/notify.ts
sha256: 509020b6e1e912b46d01b2f3157f1083ffcdabc420524876f6c6b246c0d7118d
generated_at: 2026-10-29T04:47:43.586349+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/notify.ts

## Purpose

Sends the buyer-facing order-placed confirmation email. It is wired as the `order.created` event listener so that admin-created orders and storefront checkouts both emit the same mail from one place, and a crash after the DB commit still triggers the send. It also exposes the shared `mailBuyer` / `mailBuyerOfOrder` helpers that other order lifecycle mails (cancellation, shipment) reuse.

## Key elements

- **`mailBuyer(order, build)`** — Core buyer-mail policy. Looks up the buyer via `userService` to resolve locale and display name, then delegates the actual send to the caller-supplied `build`. Never rejects: a failed lookup falls back to the order's own email as the name, and a throwing `build` is caught and logged. Skips anonymized orders entirely.
- **`mailBuyerOfOrder(orderId, build)`** — Convenience wrapper for event-listener contexts: fetches the order with `getById`, then delegates to `mailBuyer`. If the order is missing or the lookup fails, it logs and resolves. Never rejects, so the event relay won't redeliver.
- **`mailOrderPlaced({ orderId })`** — The `order.created` listener. Calls `mailBuyerOfOrder`, builds the mail via `orderConfirmEmail`, and enqueues it with `enqueueEmail`. A `bank_transfer` order's payment instructions are sent separately by the `payments` module, not here.

## Relationships

- **`@infrastructure/adapters/mailer`** — `enqueueEmail` performs the actual send in `mailOrderPlaced`.
- **`@infrastructure/adapters/logger`** — `logger.error` records failures in both `mailBuyer` and `mailBuyerOfOrder`.
- **`@infrastructure/i18n`** — `getDefaultLocale` supplies the locale fallback when the buyer has no stored preference.
- **`@kernel/events`** — `DomainEventMap` provides the `order.created` payload type for `mailOrderPlaced`.
- **`@modules/orders/domain/anonymization`** — `ANONYMIZED_EMAIL` is the sentinel that short-circuits mailing.
- **`@modules/orders/domain`** — `buyerIdOf` extracts the account id from the order.
- **`@modules/orders/emails`** — `orderConfirmEmail` assembles the subject, template, and data.
- **`@modules/orders/model`** — `OrderDocument` type used throughout.
- **`./read`** — `getById` fetches the order by id in `mailBuyerOfOrder`.
- **`@modules/users`** — `userService.getById` resolves buyer locale and username.
- **`./cancel-mail.ts`** — Sibling caller of `mailBuyer` for cancellation mails (per docstring).
- **`tests/unit/notify.test.ts`** — Unit tests for this module.

## Notes

- **Never rejects.** Both `mailBuyer` and `mailBuyerOfOrder` swallow all errors (logged, not re-thrown). This is intentional: callers sit mid-state-transition (cancel, ship) or inside an event listener where a rejection would trigger a full event redelivery.
- **`enqueueEmail` is fire-and-forget.** It logs its own failure and never rejects, which is why `mailOrderPlaced` uses `void` + an eslint-disable rather than an await.
- **Stryker markers.** The `// Stryker disable all` / `restore all` pairs guard the error-path branches during mutation testing; they are not dead code.
- **Anonymized orders produce no mail.** The check on `ANONYMIZED_EMAIL` is the only guard—no further permission or status check is performed.
