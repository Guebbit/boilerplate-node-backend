---
source: src/modules/payments/tests/unit/config.test.ts
source_sha256: c7143c701a00095a5250914c5d9ac3bd9c616f53ef94d3008f6254bdbaea7567
context_sha256: 85d55ffe6f7a6dcece252699609ba18a221ea3eea9208062c4cef53f2aee2f5a
generated_at: 2026-11-22T07:04:43.634255+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/unit/config.test.ts

## Purpose
Unit tests for the payments configuration helpers in `src/modules/payments/config.ts`: which payment methods are offered (`listPaymentMethods`), the boot-time bank-transfer validation (`validateBankTransferConfig`), and the small environment-reading accessors for bank transfer. All of these are pure reads over the environment, so no database is needed.

## Key elements
- **`configureBankTransfer()`**: local helper that sets `NODE_BANK_TRANSFER_BENEFICIARY` (`Guebbit Shop`) and `NODE_BANK_TRANSFER_IBAN` (`DE89370400440532013000`), the two variables `bankTransferEnabled()` requires.
- **`TOUCHED`**: list of the four `NODE_BANK_TRANSFER_*` variables (beneficiary, IBAN, BIC, hold hours) that these cases drive. It is passed to `withoutEnvironmentInThisFile`.
- **`listPaymentMethods` tests**:
  - Card only when transfer is unconfigured.
  - `bank_transfer` with `holdHours` (default 168) once configured.
  - A custom hold length (48).
  - Card omitted when `NODE_PAYMENT_PROVIDER` is undefined.
  - An empty list when there is neither provider nor transfer ("checkout is off").
- **`validateBankTransferConfig` tests**: returns an array of offending variable names.
  - `[]` when unconfigured or when the IBAN and beneficiary are valid.
  - `['NODE_BANK_TRANSFER_BENEFICIARY']` for an IBAN without a beneficiary.
  - `['NODE_BANK_TRANSFER_IBAN']` for a malformed IBAN.
  - `['NODE_BANK_TRANSFER_BIC']` for a malformed BIC.
  - An IBAN with spaces and a valid BIC (`COBADEFFXXX`) are accepted.
- **`bankTransferEnabled` tests**: true only when both beneficiary and IBAN are set.
- **`bankTransferBeneficiary` / `bankTransferIban` / `bankTransferBic` tests**: return `undefined` when unset, otherwise the configured value.
- **`bankTransferIbanFriendly` tests**: `undefined` without an IBAN. Otherwise it groups the IBAN into 4-character blocks and re-groups an already spaced value without doubling the spaces.
- **`bankTransferHoldHours` tests**: defaults to 168 and reads `NODE_BANK_TRANSFER_HOLD_HOURS` when set.

## Relationships
- **`src/modules/payments/config.ts`**: the module under test. The file imports `bankTransferBeneficiary`, `bankTransferBic`, `bankTransferEnabled`, `bankTransferHoldHours`, `bankTransferIban`, `bankTransferIbanFriendly`, `listPaymentMethods` and `validateBankTransferConfig` from it.
- **`tests/support/environment.ts`**: imported through the `@tests/environment` alias. It supplies `setEnvironment` (sets or unsets env vars) and `withoutEnvironmentInThisFile` (clears the listed variables before each case and restores them after the file).

## Notes
- The shared worker setup in `tests/support/setup-environment.ts` already configures bank transfer, because the `shop` scenario needs it offered. This file therefore has to clear the variables itself via `withoutEnvironmentInThisFile(TOUCHED)` to test the "not configured" state.
- `TOUCHED` does not include `NODE_PAYMENT_PROVIDER`. The tests that unset it do so with `setEnvironment({ NODE_PAYMENT_PROVIDER: undefined })` and do not restore it in this file.
- IBAN and BIC validation goes through `ibantools`. The test comments say space-separated IBANs are accepted "same as ibantools does".
