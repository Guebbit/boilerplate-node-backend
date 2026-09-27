---
source: src/modules/payments/tests/unit/config.test.ts
sha256: b571cecfe5f0261267140bf9b2068e27f6d1a61d86e99c2c45dc4aa407611e1f
generated_at: 2026-09-27T15:29:28.003472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/config.test.ts

## Purpose

Unit tests for the three pure, environment-driven exports in `src/modules/payments/config.ts` (`listPaymentMethods`, `validateBankTransferConfig`, `validateStripeSecretKey`). These cover the logic behind `GET /payments/methods` and the boot-time `customCheck` validation, requiring no database.

## Key elements

- **`configureBankTransfer()`** — local helper that sets the two env vars (`NODE_BANK_TRANSFER_BENEFICIARY`, `NODE_BANK_TRANSFER_IBAN`) needed for bank-transfer tests.
- **`TOUCHED`** — readonly array listing every env var the file mutates; passed to `withoutEnvironmentInThisFile` to guarantee a clean slate before each test and full restoration after the file finishes.
- **`describe('listPaymentMethods')`** — verifies the payment-method list: card-only when transfer is unconfigured, card + `bank_transfer` (default 168 h hold) when configured, and a custom `holdHours` override.
- **`describe('validateBankTransferConfig')`** — exercises the boot-time validator: empty config, valid IBAN + beneficiary, missing beneficiary, malformed IBAN, IBAN with spaces (accepted per `ibantools`), malformed/valid BIC.
- **`describe('validateStripeSecretKey')`** — checks key-mode rules: no key, `sk_test_` outside production, `sk_live_` in production, and rejection of `sk_test_` in production (via `withEnvironment` to fake `NODE_ENV`).

## Relationships

- **`src/modules/payments/config.ts`** — the module under test; this file imports its three exports and asserts their return values.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile` (clear/restore the `TOUCHED` list around the file) and `withEnvironment` (temporarily override `NODE_ENV` for the production-mode Stripe tests).

## Notes

- The global test setup (`tests/support/setup.ts`) pre-configures bank transfer for the `shop` scenario, so the "fully unconfigured" state this file tests must be actively created by clearing env vars — it is **not** the default.
- IBAN validation is delegated to `ibantools`; the test with a spaced IBAN (`DE89 3704 …`) documents that behavior rather than enforcing a stricter format.
- `validateStripeSecretKey` is mode-aware: it reads `NODE_ENV` to decide whether a `sk_test_` key is acceptable, which is why the production-path tests use `withEnvironment` rather than a bare `process.env` assignment.
