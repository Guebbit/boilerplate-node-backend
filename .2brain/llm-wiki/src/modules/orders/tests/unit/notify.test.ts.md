---
source: src/modules/orders/tests/unit/notify.test.ts
sha256: 46101434d2ce3746239d1e718333d04cc1990a43f5efac6c05438074060075f5
generated_at: 2026-10-15T11:20:17.428145+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/notify.test.ts

## Purpose

Unit tests for `sendOrderPlacedEmail` and `mailBuyer` (both from `services/notify.ts`) focused on one invariant: **no invoice attachment is ever sent at order-placement time**, regardless of payment method. It also verifies that `mailBuyer` short-circuits entirely (no build, no enqueue) when the order email is the anonymized placeholder.

## Key elements

- **`enqueueEmailMock`** – Module-level `jest.fn()` that backs a `jest.mock` of `@infrastructure/adapters/mailer`. All assertions about what gets sent go through this mock.
- **`orderFixture(overrides?)`** – Builds a minimal `OrderDocument` (single item, card payment) via `asStub`, with a spread-override pattern for per-test variants.
- **`describe("sendOrderPlacedEmail — no invoice attachment")`** – Two tests: card order and bank-transfer order both produce a request with `attachments === undefined`. The bank-transfer test also asserts the template name is `orders.order-transfer-instructions`.
- **`describe("mailBuyer — anonymised order")`** – Two tests: `ANONYMIZED_EMAIL` → neither the `build` callback nor `enqueueEmail` is called; a real email → `build` is called with the recipient address.

## Relationships

- **`services/notify.ts`** – SUT. Exports `sendOrderPlacedEmail` and `mailBuyer`; this file exercises their public contracts around attachments and anonymization.
- **`domain/anonymization.ts`** – Source of the `ANONYMIZED_EMAIL` constant used in the `mailBuyer` guard tests.
- **`model.ts`** – Provides the `OrderDocument` type that shapes every fixture in this file.
- **`tests/support/stub.ts`** – `asStub` gives a type-cast shortcut so fixtures can omit fields not relevant to the assertion.
- **`tests/support/environment.ts`** – `withEnvironmentOverrides` injects `NODE_BANK_TRANSFER_*` env vars for the bank-transfer test case.

## Notes

- **Template-building is intentionally NOT tested here.** Which email body each payment method produces is covered separately in `emails.test.ts`; this file only asserts the *absence* of attachments and the anonymization guard.
- The mailer mock is declared at module scope with `jest.mock`, so it replaces the adapter for the entire file. `beforeEach` clears call history and resets the resolved value.
- `asStub` bypasses real model construction; the resulting object is only as valid as the fields actually set, which is fine because the SUT under test reads only a few of them.
