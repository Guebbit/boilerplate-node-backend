---
source: src/modules/orders/services/notify.ts
sha256: 64fd1f6cb6f11898c3aadbdd68b88b416c9f8ac0a8571a339e8f88598b5d47c6
generated_at: 2026-10-15T11:08:44.696805+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/notify.ts

## Purpose

Outgoing buyer-facing email for the order lifecycle: sends the "order placed" mail (confirmation or bank-transfer instructions) and provides a shared `mailBuyer` helper that resolves the buyer's locale and display name before delegating to a caller-supplied `build` function. Exists so that `create`, `cancel`, and delivery all follow one consistent buyer-mail policy without duplicating lookup/fallback logic.

## Key elements

- **`sendOrderPlacedEmail(order, locale, name, recipientEmail)`** — Chooses between `bankTransferInstructionsEmail` (when `paymentMethod === 'bank_transfer'` **and** beneficiary, IBAN, `payBy`, and `transferReference` are all present) and the plain `orderConfirmEmail`. Fires via `enqueueEmail`; returns `void` (the send is enqueued, not awaited).
- **`mailBuyer(order, build)`** — Returns a `Promise<void>` that never rejects. Looks up `order.userId` via `userService.getById`, falls back to `order.email` as the display name on lookup failure, then calls `build(locale, name)`. Silently resolves (no-op) when `order.email === ANONYMIZED_EMAIL`. All errors are logged and swallowed.

## Relationships

- **`mailer.ts`** — `enqueueEmail` is the sole transport; both exports ultimately call it.
- **`i18n/index.ts`** — `getDefaultLocale` is the fallback when the buyer lookup yields no locale.
- **`logger.ts`** — Errors from the buyer lookup and from a throwing `build` are logged here.
- **`users/index.ts`** — `userService.getById` resolves the buyer's `locale` and `username`.
- **`orders/config.ts`** — Provides `bankTransferBeneficiary`, `bankTransferIbanFriendly`, and `transferInstructionsFor` for the bank-transfer branch.
- **`orders/domain/anonymization.ts`** — `ANONYMIZED_EMAIL` constant gates the no-op path in `mailBuyer`.
- **`orders/emails.ts`** — Supplies the two mail-template builders (`orderConfirmEmail`, `bankTransferInstructionsEmail`).
- **`orders/model.ts`** — `OrderDocument` is the order shape both exports consume.
- **`cart/services/checkout.ts`** — A documented caller context: the module comment notes checkout and `placeOrder` share this mail so the correct variant is always picked.
- **`orders/services/cancel.ts`** — Uses `mailBuyer` for the bank-transfer-expired notice.
- **`orders/services/crud.ts`** — Uses `mailBuyer` for the admin-confirmation mail on `create`.
- **`orders/services/index.ts`** — Re-exports these functions for external consumers.
- **`returns/services/notify.ts`** — Analogous pattern in the returns module (shared convention, not a direct import).

## Notes

- `mailBuyer` is deliberately infallible to its caller: both the lookup rejection and a `build` throw are caught and logged, because callers (`cancelById`, delivery) are mid state-transition and a mail failure must not roll back the transition.
- The bank-transfer branch has a five-way `&&` guard; if the deployment disables transfer **after** an order was created, the order silently falls back to the plain confirmation rather than sending an email with no payment instructions.
- `sendOrderPlacedEmail` carries no invoice — invoicing is a separate `ORDER_STATUS_CHANGED` listener that fires later.
- Stryker mutation-testing annotations (`Stryker disable all`) wrap both error-log blocks, exempting them from mutation coverage.
