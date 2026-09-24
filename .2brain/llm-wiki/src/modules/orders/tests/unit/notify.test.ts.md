---
source: src/modules/orders/tests/unit/notify.test.ts
sha256: 90eaa862202d035ec6e1ed3d1c4120d2fd7fe251838efa51a1623c7c4743f1a1
generated_at: 2026-09-23T19:14:37.451250+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/notify.test.ts

## Purpose

Unit tests for the **invoice-attachment pipeline** inside `sendOrderPlacedEmail` (`services/notify.ts`). The file asserts that a rendered invoice PDF is spooled and attached as `{ filename, key }` to the outgoing mail, that a render failure degrades gracefully (mail still sends, attachment omitted, error logged), and that the attachment rides along with both the card-confirmation and bank-transfer-instructions email variants. It deliberately does **not** test which email builder is selected — that coverage lives in `emails.test.ts`.

## Key elements

- **Module mocks (top-level `jest.mock` calls):**
  - `renderInvoicePdf` (`../../services/invoice`) — stubbed via `renderInvoicePdfMock`
  - `spoolAttachment` (`@infrastructure/adapters/mail-spool`) — stubbed via `spoolAttachmentMock`
  - `enqueueEmail` (`@infrastructure/adapters/mailer`) — stubbed via `enqueueEmailMock`
  - `logger` (`@infrastructure/adapters/logger`) — stubbed via `loggerMock` (exposed as a getter to match the real module's lazy export)

- **`orderFixture(overrides?)`** — builds a minimal `OrderDocument` shaped for `sendOrderPlacedEmail`; defaults to a card-payment order with one item. Uses `asStub` from test support.

- **`flush()`** — returns a `Promise` that resolves on `setImmediate`, draining the microtask queue that `sendOrderPlacedEmail`'s internal `.then` chain depends on.

- **Test cases (5):**
  1. Invoice attached under its invoice number after render + spool.
  2. Filename falls back to order `_id` when `invoiceNumber` is absent.
  3. Render rejection → mail still enqueued with empty `attachments`, `logger.error` called with `orderId`.
  4. `renderInvoicePdf` resolves `undefined` (nothing to render) → no spool call, empty `attachments`.
  5. Bank-transfer order (requires `NODE_BANK_TRANSFER_*` env vars) → invoice attached to the `orders.order-transfer-instructions` template.

## Relationships

- **`src/modules/orders/model.ts`** — imports the `OrderDocument` type, used to shape `orderFixture` and to type-annotate the test arguments.
- **`tests/support/stub.ts`** — provides `asStub<T>`, used to cast the fixture literal to `OrderDocument` without a full runtime implementation.
- **`tests/support/environment.ts`** — provides `withEnvironmentOverrides`, used in the bank-transfer test to inject `NODE_BANK_TRANSFER_BENEFICIARY` and `NODE_BANK_TRANSFER_IBAN` around the call under test.
- **`tests/cross-cutting/contract-search-parity.test.ts`** — listed as a graph neighbor but has no direct import or interaction in this file.

## Notes

- Each test uses **dynamic `await import('../../services/notify')`** after mocks are configured, ensuring the module is (re)evaluated with the correct mock bindings rather than a cached reference.
- `sendOrderPlacedEmail` is called **without `await`** and then `flush()` is awaited — the function is fire-and-forget internally (its `.then` chain runs on microtasks), so a plain `await` on the call would not be sufficient.
- The `logger` mock uses a **getter** (`get logger()`) with `__esModule: true` to replicate the real adapter's lazy-export pattern; a simple object assignment would not intercept destructuring of `import { logger }`.
- The file's own docstring explicitly scopes it: builder-selection logic is out of scope and covered by `emails.test.ts`.
