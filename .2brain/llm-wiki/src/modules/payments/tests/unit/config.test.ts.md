---
source: src/modules/payments/tests/unit/config.test.ts
sha256: c7143c701a00095a5250914c5d9ac3bd9c616f53ef94d3008f6254bdbaea7567
generated_at: 2026-11-08T07:39:26.750404+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/config.test.ts

## Purpose

Unit tests for the payment-configuration module (`../../config`). Covers the pure, environment-reading helpers that power `GET /payments/methods`, checkout availability, and the boot-time `validateBankTransferConfig` check. No database or network is involved.

## Key elements

- **`configureBankTransfer`** – local helper that sets the two env vars (`NODE_BANK_TRANSFER_BENEFICIARY`, `NODE_BANK_TRANSFER_IBAN`) required for bank-transfer to be "on."
- **`TOUCHED`** – `as const` array of the four `NODE_BANK_TRANSFER_*` env-var names this file mutates; passed to `withoutEnvironmentInThisFile` for per-test isolation and post-file restore.
- **`describe('listPaymentMethods')`** – 5 cases: card-only, card + bank_transfer (default and custom `holdHours`), bank_transfer-only when no card provider, and empty list when nothing is configured.
- **`describe('validateBankTransferConfig')`** – 7 cases: unconfigured (no errors), fully valid, missing beneficiary, malformed IBAN, spaced IBAN (accepted per `ibantools`), malformed BIC, valid BIC.
- **`describe('bankTransferEnabled')`** – 4 cases confirming the boolean gate requires *both* beneficiary and IBAN.
- **`describe('bankTransferBeneficiary / bankTransferIban / bankTransferBic')`** – accessor tests: `undefined` when unset, configured value when set.
- **`describe('bankTransferIbanFriendly')`** – IBAN grouped into 4-char blocks; idempotent when the input already contains spaces.
- **`describe('bankTransferHoldHours')`** – defaults to 168 (one week); reads `NODE_BANK_TRANSFER_HOLD_HOURS` when present.

## Relationships

- **`src/modules/payments/config.ts`** – the system under test. The file imports `listPaymentMethods`, `validateBankTransferConfig`, `bankTransferEnabled`, `bankTransferBeneficiary`, `bankTransferIban`, `bankTransferBic`, `bankTransferIbanFriendly`, and `bankTransferHoldHours` for direct assertion.
- **`tests/support/environment.ts`** – provides `setEnvironment` (to inject or clear individual env vars per test) and `withoutEnvironmentInThisFile` (to guarantee every var in `TOUCHED` is cleared before each test and restored after the file finishes).

## Notes

- The `shop` scenario in `tests/support/setup-environment.ts` pre-configures bank transfer for the whole worker. Because of this, "bank transfer is not configured at all" is an *artificial* state this file must create by clearing the vars — it cannot assume a clean slate.
- `NODE_PAYMENT_PROVIDER` is set to `undefined` in two `listPaymentMethods` tests but is **not** listed in `TOUCHED`; its lifecycle is presumably managed by the broader environment setup rather than by this file's `withoutEnvironmentInThisFile` guard.
- IBAN and BIC validation is delegated to the `ibantools` library (spaced IBANs are valid input); the tests assert parity with that library's behaviour rather than re-implementing the check.
