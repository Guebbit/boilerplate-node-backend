---
source: src/modules/orders/services/notify.ts
source_sha256: 9aed490d0c2e7b82d0ea1b4b2150d1f1f7c509f7073f4163230f10709fa9b56a
context_sha256: 8a961a872e68851dd69f654e801e5e52ee512a1f789d650b9373d2576fda6fa8
generated_at: 2026-11-22T06:21:19.857233+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/notify.ts

## Purpose
Sends the buyer-facing "order placed" email from the `order.created` event listener, so that admin `create` and the storefront checkout send the same mail from a single place. The mail carries no invoice, since an order is only invoiced once paid, after creation. The file also hosts the shared buyer-mail helpers used by other customer mails.

## Key elements
- **`mailBuyer(order, build)`**: the common buyer-mail policy. Skips anonymised orders (`order.email === ANONYMIZED_EMAIL`, an undeliverable `.invalid` address). Otherwise looks up the buyer by the id from `buyerIdOf(order)` when one exists, then calls `build(locale, name)`. Locale falls back to `getDefaultLocale()` and name to `order.email`. Lookup failures and `build` errors are logged and swallowed. Returns a promise that never rejects and settles once `build` has run.
- **`mailBuyerOfOrder(orderId, build)`**: `mailBuyer` for outbox-event listeners. Loads the order with `getById` and skips it if it is gone. It passes `build` the order, locale and name. It never rejects, because a rejecting listener would make the relay redeliver the event.
- **`mailOrderPlaced({ orderId })`**: the listener for the order-created event. Builds the confirmation (with withdrawal notice) via `orderConfirmEmail` and queues it with `enqueueEmail` to `order.email`, whatever the payment method.

## Relationships
- `src/infrastructure/adapters/mailer.ts`: `enqueueEmail` sends the mail. It never rejects, as it logs its own failures.
- `src/infrastructure/adapters/logger.ts`: logs lookup and send failures.
- `src/infrastructure/i18n/index.ts`: `getDefaultLocale` supplies the fallback locale.
- `src/kernel/events.ts`: `DomainEventMap` types the listener payload.
- `src/modules/orders/domain/anonymization.ts`: `ANONYMIZED_EMAIL` marks orders that must not be mailed.
- `src/modules/orders/domain/index.ts`: `buyerIdOf` extracts the buyer id from an order.
- `src/modules/orders/emails.ts`: `orderConfirmEmail` builds the subject, template and data.
- `src/modules/orders/model.ts`: `OrderDocument` type.
- `src/modules/orders/services/read.ts`: `getById` loads the order.
- The doc comments say cancellation and shipment also use `mailBuyer` mid state-transition.

## Notes
- `build` is synchronous and void-returning; it should only call `enqueueEmail`. Errors it throws are caught by `mailBuyer`, so they cannot undo the caller's state transition.
- The buyer's `locale` and `username` come from an external users service lookup (`@modules/users`), which is not among this file's graph neighbors.
- For `bank_transfer` orders, the payment instructions go out as a second mail owned by `payments`, not this file.
- The `Stryker disable/restore` comments exclude the logging catch blocks from mutation testing.
