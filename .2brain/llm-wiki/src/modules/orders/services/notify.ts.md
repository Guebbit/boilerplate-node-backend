---
source: src/modules/orders/services/notify.ts
sha256: 51c5f7f5bb3596a8af561aef133f00739675049f5f1124ba6ce51a9b1c7c058e
generated_at: 2026-09-23T19:07:43.748883+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/services/notify.ts

## Purpose

Sends the "order placed" email (confirmation or bank-transfer instructions) with an attached invoice PDF. It exists so that both the storefront checkout path and the admin `create` path share a single, payment-method-driven email decision, decoupled from the request that placed the order.

## Key elements

- **`sendOrderPlacedEmail`** _(exported)_ — The sole public entry point. Selects `bankTransferInstructionsEmail` vs `orderConfirmEmail` based on `order.paymentMethod` and the presence of configured beneficiary/IBAN/BIC, renders + spools the invoice attachment, then calls `enqueueEmail`. Returns `void`; callers must `void` the call.
- **`invoiceAttachment`** _(internal)_ — Renders the invoice via `renderInvoicePdf`, spools the resulting PDF through `spoolAttachment`, and returns a `MailAttachment[]`. On any render/spool failure it logs an error and resolves to `[]` so the email still goes out.
- **`MailAttachment`** _(internal interface)_ — Describes one attachment as `{ filename, key }` (a reference, never raw bytes).

## Relationships

- **`@infrastructure/adapters/mailer`** — calls `enqueueEmail` to hand the composed mail to the transport queue.
- **`@infrastructure/adapters/mail-spool`** — calls `spoolAttachment(pdf, 'pdf')` to persist the rendered invoice as a retrievable key.
- **`@infrastructure/adapters/logger`** — logs the non-fatal invoice-render failure with `orderId` and the error.
- **`../config`** — reads `bankTransferBeneficiary`, `bankTransferIbanFriendly`, `bankTransferBic` to decide whether the instructions email is sendable.
- **`../emails`** — imports `orderConfirmEmail` and `bankTransferInstructionsEmail` template builders.
- **`./invoice`** — imports `renderInvoicePdf` to produce the PDF bytes.
- **`../model`** — consumes the `OrderDocument` type (the order passed in by callers).
- **`./index`** — re-exports `sendOrderPlacedEmail` as part of the orders-services barrel.
- **`../services/crud`** and **`src/modules/cart/services/checkout`** — callers that invoke `sendOrderPlacedEmail` after the order row is already written.

## Notes

- **Fire-and-forget contract:** `sendOrderPlacedEmail` is intentionally synchronous-returning (`void`). The invoice render involves a Chromium launch; callers must not `await` it or the placing request will be held hostage.
- **Fallback chain for bank transfer:** If the order is `bank_transfer` but the deployment has since removed the beneficiary/IBAN config (or the order lacks `payBy`/`transferReference`), the email degrades to the plain confirmation rather than an unpayable instructions email.
- **Invoice failure is non-fatal:** A render or spool error is logged and swallowed; the email is still enqueued with zero attachments.
- **Stryker mutation-testing guards** (`// Stryker disable all` / `restore all`) surround the error-log block so the catch-path is not killed by mutation in CI.
- **Locale & name are caller-supplied:** The function does not derive language or greeting itself; the caller passes the buyer's stored locale and an appropriate display name (username for storefront, email address for admin-placed orders).
