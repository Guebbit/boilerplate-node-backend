---
source: src/modules/orders/services/notify.ts
sha256: 509020b6e1e912b46d01b2f3157f1083ffcdabc420524876f6c6b246c0d7118d
generated_at: 2026-11-08T06:58:14.374692+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/notify.ts

## Purpose

Sends the buyer-facing "order placed" confirmation email, wired as the `order.created` outbox-event listener. Centralising the mail here means the admin `create` path and the cart checkout path both emit the same message from one place, and a crash after the DB commit still triggers the send. No invoice data is included because invoicing happens later in the `invoicing` module's own status-changed listener.

## Key elements

- **`mailBuyer(order, build)`** — The single buyer-mail policy used by every customer-facing mail. Looks up the buyer via `userService`, resolves locale and display name (falling back to `getDefaultLocale()` / `order.email`), then invokes `build`. Swallows all errors (logged, never re-thrown). Skips anonymised orders entirely.
- **`mailBuyerOfOrder(orderId, build)`** — Convenience wrapper for outbox-event listeners: loads the order by id via `getById`, delegates to `mailBuyer`, and passes the order alongside locale/name to `build`. Silently skips if the order no longer exists.
- **`mailOrderPlaced(payload)`** — The `order.created` listener entry point. Builds the confirmation email with `orderConfirmEmail` and enqueues it through `enqueueEmail`. (A `bank_transfer` order receives a *second* instructions mail from the `payments` module, not here.)

## Relationships

- **`@infrastructure/adapters/mailer`** — `enqueueEmail` is the sole transport; called inside `mailOrderPlaced`'s `build` callback.
- **`@infrastructure/adapters/logger`** — Error logging for failed buyer lookups and failed sends; also logs inside `mailBuyerOfOrder`'s catch.
- **`@infrastructure/i18n`** — `getDefaultLocale()` provides the locale fallback when the buyer record is missing.
- **`@modules/users`** — `userService.getById` resolves the buyer's locale and username for personalisation.
- **`@modules/orders/domain/anonymization`** — `ANONYMIZED_EMAIL` sentinel used to short-circuit anonymised orders.
- **`@modules/orders/domain`** — `buyerIdOf` extracts the account id from an `OrderDocument`.
- **`@modules/orders/emails`** — `orderConfirmEmail` builds the subject, template, and data for the confirmation mail.
- **`@modules/orders/model`** — `OrderDocument` type used throughout.
- **`./read`** — `getById` loads the order document inside `mailBuyerOfOrder`.
- **`@kernel/events`** — `DomainEventMap` provides the typed `order.created` payload shape.

## Notes

- **Never rejects.** Both `mailBuyer` and `mailBuyerOfOrder` catch all errors internally. This is deliberate: callers (cancellation, shipment, outbox relay) are mid state-transition or event-handling, and a mail hiccup must not undo the transition or cause the event to be redelivered.
- **Anonymised orders are invisible to this module.** If `order.email === ANONYMIZED_EMAIL`, `mailBuyer` resolves immediately with no side effects.
- **The `build` callback is synchronous** (`void` return). The actual async work (`enqueueEmail`) is fire-and-forget inside the callback; `enqueueEmail` logs its own failures.
- **Stryker mutation-testing annotations** (`Stryker disable all` / `restore all`) wrap every `logger.error` block—mutation testing is suppressed there by design.
