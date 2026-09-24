---
source: src/modules/payments/tests/unit/config.test.ts
sha256: 149daeb0513b14af6e255124703eae3d2692a1af14a36419f0ea084c74705f8d
generated_at: 2026-09-23T19:24:09.321462+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/config.test.ts

## Purpose

Unit tests for the two pure environment-read functions exported by `src/modules/payments/config.ts`: `listPaymentMethods` (backs `GET /payments/methods` and checkout) and `validateBankTransferConfig` (the boot-time `customCheck`). Because both functions only read `process.env`, no database or server is required.

## Key elements

- **`configureBankTransfer()`** — local helper that sets the two variables `bankTransferEnabled()` requires (`NODE_BANK_TRANSFER_BENEFICIARY` and `NODE_BANK_TRANSFER_IBAN`) to known-good values.
- **`TOUCHED`** — readonly array of every environment variable the file may write. Passed to `withoutEnvironmentInThisFile` so each test starts with a clean slate and the file restores prior values on exit.
- **`describe('listPaymentMethods')`** — three cases: unconfigured → only `card`; configured → `card` + `bank_transfer` with default `holdHours: 168`; configured with `NODE_BANK_TRANSFER_HOLD_HOURS=48` → `holdHours: 48`.
- **`describe('validateBankTransferConfig')`** — seven cases covering: fully unconfigured (no errors), valid IBAN + beneficiary, missing beneficiary, malformed IBAN, IBAN with spaces (accepted, matching `ibantools`), malformed BIC, and valid BIC.

## Relationships

- **`src/modules/payments/config.ts`** — the system under test; this file imports `listPaymentMethods` and `validateBankTransferConfig` from it.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile`, the isolation utility that snapshots and restores the `TOUCHED` variables around the whole file.

## Notes

- The "bank transfer not configured" state is **created** by this file (via env-var clearing) rather than assumed. The global `tests/support/setup.ts` already sets bank-transfer variables for the `shop` scenario, so a fresh process would not be in the unconfigured state.
- Default hold hours when `NODE_BANK_TRANSFER_HOLD_HOURS` is unset is **168** (7 days), as seen in the expected output.
- IBAN validation is delegated to `ibantools`; spaces in the IBAN string are accepted by that library and therefore by `validateBankTransferConfig`.
