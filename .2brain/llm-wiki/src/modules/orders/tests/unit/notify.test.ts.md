---
source: src/modules/orders/tests/unit/notify.test.ts
sha256: 5426b98f6e2ddfbb195a04972f85502951eefa7febecdf9a9e206528e41c6a1d
generated_at: 2026-09-27T15:21:58.422862+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/notify.test.ts

## Purpose

Unit tests for the invoice-attachment behaviour of `sendOrderPlacedEmail` (in `services/notify.ts`). This file asserts that the rendered invoice PDF is spooled and passed to `enqueueEmail` as an `{ filename, key }` attachment, that a render failure degrades gracefully (mail still sent, error logged), and that the attachment rides along on both the card-confirmation and bank-transfer-instructions paths. It explicitly does **not** test which email builder fires — that belongs to `emails.test.ts`.

## Key elements

- **`orderFixture(overrides?)`** – builds a minimal `OrderDocument` (card payment, one item) via `asStub`, used as the default input for every test case.
- **`flush()`** – resolves one `setImmediate` tick so the internal `.then` chain inside `sendOrderPlacedEmail` completes before assertions run.
- **Module-level mocks** – `renderInvoicePdf`, `spoolAttachment`, `enqueueEmail`, and `logger` are all `jest.mock`'d at the top of the file; each test sets return values/rejections on the individual mock functions.
- **Test cases (5):**
  - Invoice attached under its own order number when present.
  - Filename falls back to the order `_id` when no `orderNumber` exists.
  - Render rejection → mail sent with empty `attachments`, `logger.error` called.
  - Render resolves to `undefined` (nothing to render) → mail sent with empty `attachments`, `spoolAttachment` never called.
  - Bank-transfer path: env overrides set, template is `orders.order-transfer-instructions`, attachment still present.

## Relationships

- **`src/modules/orders/model.ts`** – provides the `OrderDocument` type that `orderFixture` conforms to.
- **`tests/support/stub.ts`** – `asStub` is used to type-cast the fixture object without exhaustive field filling.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` temporarily sets `NODE_BANK_TRANSFER_BENEFICIARY` / `NODE_BANK_TRANSFER_IBAN` for the bank-transfer test case.

## Notes

- Every test case re-imports `../../services/notify` with `await import(...)` after the mocks are registered, ensuring fresh module state per test.
- The render-failure branch is asserted **here** (not in `emails.test.ts`) because the module docblock states "nothing else drives it."
- `spoolAttachmentMock` receives `(bytes, extension)` — the extension is the string `'pdf'` (no dot).
- The file is a `@module` (no named exports); it is purely a test script.
