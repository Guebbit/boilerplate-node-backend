---
source: src/modules/orders/services/notify.ts
sha256: 3c7aec191a578c837f508e65cdf93b0d9bd55fcf42d11d60a4a4820a669ba307
generated_at: 2026-09-27T15:14:38.102837+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/notify.ts

## Purpose

Sends the placed-order email (confirmation or bank-transfer instructions) and provides `mailBuyer`, the shared buyer-mail policy consumed by admin confirmations, cancellation notices, and delivery-shipped notices. The email variant is chosen from the order's own `paymentMethod` so callers (`create`, cart checkout) can never pick the wrong template.

## Key elements

- **`sendOrderPlacedEmail(order, locale, name, recipientEmail): void`** – The main export. Picks `bankTransferInstructionsEmail` or `orderConfirmEmail` based on `order.paymentMethod` and configured transfer settings, renders/spools the PDF receipt (gracefully omitting it on failure), and enqueues the mail via `enqueueEmail`. Fire-and-forget by design; the caller must `void` the resulting promise.
- **`mailBuyer(order, build): Promise<void>`** – Shared policy: looks up the buyer via `userService.getById` to resolve locale and display name, then invokes the caller-supplied `build` callback (which performs the actual send). Never rejects — both a failed lookup and a throwing `build` are caught, logged, and swallowed so a mail hiccup cannot undo a mid-transition state change.
- **`invoiceAttachment(orderId, orderNumber): Promise<MailAttachment[]>`** – (internal) Calls `renderInvoicePdf`, spools the PDF via `spoolAttachment`, and returns a one-element attachment array. Resolves to `[]` on any render/spool error.
- **`MailAttachment`** – `{ filename, key }` interface matching the attachment shape `enqueueEmail` expects (spool key, never raw bytes).

## Relationships

- **`@infrastructure/adapters/mailer`** – `enqueueEmail` is the transport call for every mail this file sends.
- **`@infrastructure/adapters/mail-spool`** – `spoolAttachment` stores the rendered PDF so the mailer can attach it by key.
- **`@infrastructure/adapters/logger`** – `logger.error` records every degraded path (receipt render failure, buyer-lookup failure, `mailBuyer` send failure).
- **`@infrastructure/i18n`** – `getDefaultLocale` provides the fallback locale when the buyer record is missing.
- **`src/modules/orders/config.ts`** – `bankTransferBeneficiary()`, `bankTransferIbanFriendly()`, and `transferInstructionsFor()` gate and populate the transfer-instructions branch.
- **`src/modules/orders/emails.ts`** – `orderConfirmEmail` and `bankTransferInstructionsEmail` build the `{ subject, template, data }` payload.
- **`src/modules/orders/model.ts`** – `OrderDocument` type for the order argument.
- **`src/modules/orders/services/invoice.ts`** – `renderInvoicePdf` produces the PDF bytes that get spooled.
- **`src/modules/orders/services/index.ts`** – Barrel that re-exports `sendOrderPlacedEmail` / `mailBuyer` to the rest of the orders module.
- **`src/modules/cart/services/checkout.ts`**, **`src/modules/orders/services/crud.ts`**, **`src/modules/orders/services/cancel.ts`**, **`src/modules/delivery/service.ts`** – Callers that invoke `sendOrderPlacedEmail` or `mailBuyer` after writing the order / transitioning state.

## Notes

- **Fire-and-forget contract.** `sendOrderPlacedEmail` returns `void`; the internal `.then(...)` chain is deliberately not awaited. The invoice render spawns a Chromium process and must never stretch the HTTP request that placed the order. Every caller is expected to `void` the call site.
- **Bank-transfer branch is doubly gated.** Even when `paymentMethod === 'bank_transfer'`, the instructions email is only sent if *both* `bankTransferBeneficiary()` and `bankTransferIbanFriendly()` return truthy **and** the order carries `payBy` and `transferReference`. An order minted while transfer was on but read back after it was disabled silently falls back to the plain confirmation.
- **`recipientEmail` ≠ `order.email`.** The recipient parameter exists so an admin can place or mail on behalf of another party; do not assume they match.
- **`mailBuyer` never rejects.** Both the lookup `.catch` and the outer `.catch` around `build` swallow errors. Callers that need sequencing (e.g. delivery's audit line) can safely `await` it.
- **Stryker annotations.** The `Stryker disable all` / `restore all` blocks mark error-only branches whose mutations are intentionally excluded from mutation-coverage reporting.
- **Locale is decided once by the caller** and threaded through, so the order document and the email can never quote two different languages.
