---
source: src/modules/payments/config.ts
sha256: abe16b667f9182575a5274d3cf8ad0880e4b5606c9f6a780137315661606a62a
generated_at: 2026-09-23T19:16:31.285790+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/config.ts

## Purpose

Centralises the payment-method configuration that belongs to the payments module: the list of methods offered to clients and the boot-time validation of bank-transfer credentials. Values are read per call (not cached at import) so a runtime change to a `NODE_BANK_TRANSFER_*` env var takes effect on the next request without a restart. The actual bank-transfer _values_ (beneficiary, IBAN, BIC, hold hours, enabled flag) live in `@modules/orders`; this file only validates them and derives the method list.

## Key elements

- **`PaymentMethodInfo`** (interface) — shape of one entry in the methods list: `id: 'card' | 'bank_transfer'` plus optional `holdHours` (present only for `bank_transfer`).
- **`listPaymentMethods()`** — returns the ordered list of methods the deployment offers. `card` is always included; `bank_transfer` is appended only when `bankTransferEnabled()` is truthy, carrying the current `holdHours`. Both `GET /payments/methods` and checkout defer to this single function to avoid drift.
- **`validateBankTransferConfig()`** — boot-time gate (registered as the module's `customCheck`). Normalises the IBAN with `electronicFormatIBAN`, then checks IBAN and BIC with `ibantools`. Returns an array of offending variable names (`NODE_BANK_TRANSFER_BENEFICIARY`, `…_IBAN`, `…_BIC`); empty when transfer is unconfigured or all values are valid.

## Relationships

- **`src/modules/orders/config.ts`** (via `@modules/orders` → `index.ts` barrel) — supplies the five `bankTransfer*` readers this file imports. Orders owns the values; payments consumes and validates them.
- **`src/modules/payments/controllers/get-payment-methods.ts`** — calls `listPaymentMethods()` to build its HTTP response.
- **`src/modules/payments/module.ts`** — registers `validateBankTransferConfig` as the module's `customCheck` so the process refuses to start with a bad IBAN/BIC.
- **`src/modules/payments/tests/unit/config.test.ts`** — unit-tests both exported functions.
- **`src/modules/payments/services/intent.ts`**, **`services/offline.ts`**, **`services/index.ts`** — sibling services in the same module; they do not import this file directly but share the module boundary through `module.ts`.

## Notes

- The IBAN is normalised (`electronicFormatIBAN`) _before_ validation to handle pasted IBANs that contain spaces.
- `validateBankTransferConfig` only flags `NODE_BANK_TRANSFER_BENEFICIARY` when an IBAN _is_ set but the beneficiary is missing; if the entire transfer feature is disabled the function returns `[]` (no false alarms).
- The file deliberately does **not** re-export or own the bank-transfer values — that authority stays in `orders` because `orders` renders transfer instructions and enforces the open-transfer cap.
