---
source: src/modules/payments/tests/unit/config.test.ts
sha256: 8a2e341fb894f3c770d296a4782e098a613b0e982eb54e4645d99ab23237c28e
generated_at: 2026-10-15T11:37:52.464719+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/config.test.ts

## Purpose
Unit tests for the two pure-read functions in the payments config slice: `listPaymentMethods` (the shared source for `GET /payments/methods` and checkout) and `validateBankTransferConfig` (boot-time IBAN/BIC check). No database is required; all state comes from environment variables.

## Key elements
- **`configureBankTransfer()`** — local helper that sets `NODE_BANK_TRANSFER_BENEFICIARY` and `NODE_BANK_TRANSFER_IBAN` to known-valid values.
- **`TOUCHED`** — readonly array of every env var this file mutates; passed to `withoutEnvironmentInThisFile` to guarantee a clean slate per test and restore after the file.
- **`describe('listPaymentMethods')`** — five cases covering: card-only fallback, card + bank_transfer with default 168 h hold, custom hold hours, bank_transfer-only when no card provider is set, and empty list when neither is configured.
- **`describe('validateBankTransferConfig')`** — seven cases covering: unconfigured (no errors), valid IBAN + beneficiary, missing beneficiary, malformed IBAN, IBAN with spaces (accepted, matching `ibantools` behavior), malformed/valid BIC.

## Relationships
- **`src/modules/payments/config.ts`** — the module under test; this file imports `listPaymentMethods` and `validateBankTransferConfig` directly.
- **`tests/support/environment.ts`** — provides `setEnvironment` (per-test env mutation) and `withoutEnvironmentInThisFile` (auto-restore of tracked vars), both used throughout.

## Notes
- The `shop` worker scenario pre-configures bank transfer in `tests/support/setup-environment.ts`, so "transfer not configured" is *not* the ambient state — this file must explicitly clear the vars (done via `TOUCHED`) before asserting the unconfigured path.
- `NODE_PAYMENT_PROVIDER` is set to `undefined` in two tests to simulate a missing card provider; it is *not* in `TOUCHED`, meaning the global setup value is restored by the outer test harness, not by this file's `withoutEnvironmentInThisFile` call.
- IBAN and BIC validation is delegated to the `ibantools` package (noted in the file header); tests confirm it accepts space-separated IBANs but reject clearly malformed strings.
