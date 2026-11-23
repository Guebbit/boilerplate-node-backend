---
source: src/modules/payments/tests/unit/module.test.ts
source_sha256: 6d0a2df7d994920df4f43c9890d3dc26bad4fe161888f24149f34e268361360f
context_sha256: 249efe68c5f7cfa6c51572b1c8ecc7cf70dd8f28c2ca926160f8bed7725493b7
generated_at: 2026-11-22T07:05:33.518169+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/payments/tests/unit/module.test.ts

## Purpose
Unit tests for the payments module's boot-time config gate on `NODE_PAYMENT_PROVIDER` and `NODE_PAYMENT_WEBHOOK_SECRET`. They check that bad values make `assertModuleConfig` throw at boot rather than on the first payment. This file covers only the provider-selector and webhook-secret half of the manifest's combined slice check. `validateBankTransferConfig` is tested in `config.test.ts`.

## Key elements
- `withoutEnvironmentInThisFile([...])`: called at the top for `NODE_ENV`, `NODE_PAYMENT_PROVIDER` and `NODE_PAYMENT_WEBHOOK_SECRET`. It isolates those variables for this file.
- `configure()`: local helper that sets `NODE_ENV` to `development`. The gate short-circuits under `test`, so every case must move `NODE_ENV` away from it first.
- `describe('the payment provider selector')`:
  - An unset provider is accepted (no card payments, not an error).
  - A registered provider (`fake`) is accepted.
  - An unrecognized name throws an error matching `/NODE_PAYMENT_PROVIDER/`.
- `describe('the payment webhook secret')`:
  - May stay unset, even in production.
  - A value under 16 characters is rejected.
  - A comma-separated ring of secrets is accepted if every entry is long enough.
  - A ring with a short second entry is rejected.
  - A trailing comma is rejected, since the empty entry counts as no secret.
  - The `.env`-example placeholder (`your-payment-webhook-secret-here`) is rejected in production.
- Every assertion calls `assertModuleConfig([paymentsModule], [])` and expects either no throw or an error matching the variable name.

## Relationships
- `src/kernel/module-config.ts`: provides `assertModuleConfig`, the function under test.
- `src/modules/payments/module.ts`: its default export, `paymentsModule`, is the manifest passed to `assertModuleConfig`.
- `tests/support/environment.ts`: provides `withoutEnvironmentInThisFile` and `setEnvironment` (imported as `@tests/environment`) for controlling env vars per test.
- The header comment says `resolvePaymentProvider` in `../../providers` produces the unknown-provider error message. The test file does not import it.

## Notes
- Each test must set `NODE_ENV` itself (via `configure()` or directly). A case that leaves it at `test` would assert nothing.
- The production-specific cases set `NODE_ENV: 'production'` directly instead of using `configure()`.
