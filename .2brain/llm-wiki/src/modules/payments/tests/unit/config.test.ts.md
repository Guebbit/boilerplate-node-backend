---
source: src/modules/payments/tests/unit/config.test.ts
sha256: c7143c701a00095a5250914c5d9ac3bd9c616f53ef94d3008f6254bdbaea7567
generated_at: 2026-10-29T05:23:18.076833+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/config.test.ts

## Purpose

Unit tests for the payment configuration module (`src/modules/payments/config.ts`), covering the `listPaymentMethods` endpoint logic, the boot-time `validateBankTransferConfig` check, and the individual bank-transfer accessor functions. All tested functions are pure environment reads, so no database or HTTP layer is involved.

## Key elements

- **`configureBankTransfer()`** – local helper that sets the two env vars (`NODE_BANK_TRANSFER_BENEFICIARY`, `NODE_BANK_TRANSFER_IBAN`) required by `bankTransferEnabled()`.
- **`TOUCHED`** – readonly list of the four bank-transfer env vars this file mutates; passed to `withoutEnvironmentInThisFile` to guarantee a clean slate before each test and restoration after the file finishes.
- **`describe('listPaymentMethods', …)`** – 5 cases covering: card-only (transfer unconfigured), card + bank_transfer, custom hold-hours, bank_transfer-only (no payment provider), and empty array (neither configured).
- **`describe('validateBankTransferConfig', …)`** – 7 cases exercising IBAN validation (via `ibantools`), beneficiary pairing, BIC format, and the "spaces in IBAN" edge case.
- **`describe('bankTransferEnabled', …)`** – 4 cases: false with 0, 1, or the wrong single variable set; true only when both beneficiary and IBAN are present.
- **`describe('bankTransferBeneficiary / bankTransferIban / bankTransferBic', …)`** – 2 cases: undefined when unset, value passthrough when set.
- **`describe('bankTransferIbanFriendly', …)`** – 3 cases: undefined, 4-char grouping, and idempotent re-grouping of an already-spaced IBAN.
- **`describe('bankTransferHoldHours', …)`** – 2 cases: default of 168 (one week) and reading a custom `NODE_BANK_TRANSFER_HOLD_HOURS` value.

## Relationships

- **`src/modules/payments/config.ts`** – the module under test; this file imports every public export (`listPaymentMethods`, `validateBankTransferConfig`, `bankTransferEnabled`, `bankTransferBeneficiary`, `bankTransferIban`, `bankTransferBic`, `bankTransferIbanFriendly`, `bankTransferHoldHours`) and asserts their behaviour.
- **`tests/support/environment.ts`** – provides `setEnvironment` (per-test env mutation) and `withoutEnvironmentInThisFile` (file-scoped isolation), both consumed at the top of this file.

## Notes

- The global test setup (`tests/support/setup-environment.ts`) pre-sets bank-transfer vars for the `shop` scenario. This file therefore **cannot assume an unconfigured state**; it relies on `withoutEnvironmentInThisFile(TOUCHED)` to clear those vars before each case.
- `NODE_PAYMENT_PROVIDER` is set in two `listPaymentMethods` cases but is **not** in the `TOUCHED` array, so it is not isolated by `withoutEnvironmentInThisFile`. If a future test depends on it being unset, it must be reset explicitly.
- IBAN validation delegates to the `ibantools` library; the test asserting spaced-IBAN acceptance documents that delegation contract.
