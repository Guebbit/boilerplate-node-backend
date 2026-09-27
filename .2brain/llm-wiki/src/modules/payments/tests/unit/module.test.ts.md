---
source: src/modules/payments/tests/unit/module.test.ts
sha256: 387d8b1415b0a59fccbbad1e0b752e5059970d41914aba0376bf08b062c200ca
generated_at: 2026-09-27T15:29:38.015164+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/module.test.ts

## Purpose

Boot-time validation tests for the payments module's manifest `customCheck`, specifically the provider-selector half (which provider name is accepted) and the single wiring-proof case for the Stripe secret key gate. It verifies that `assertRequiredConfig` throws at boot for misconfigured providers/keys rather than deferring failure to the first payment.

## Key elements

- **`configure()`** — helper that sets `NODE_ENV = 'development'` so the gate does not short-circuit under the test environment.
- **`describe('the payment provider selector')`** — three cases: unset provider defaults to `fake`, explicit `fake` is accepted, unrecognized name throws `/NODE_PAYMENT_PROVIDER/`.
- **`describe('the Stripe secret key gate')`** — one case: production + `sk_test_*` key throws `/NODE_STRIPE_SECRET_KEY/`. This is the wiring proof (manifest actually calls the validator), not a test of the validator's logic.
- **`withoutEnvironmentInThisFile([...])`** — module-level cleanup call ensuring `NODE_ENV`, `NODE_PAYMENT_PROVIDER`, and `NODE_STRIPE_SECRET_KEY` are unset after the file's tests run.

## Relationships

- **`src/kernel/required-config.ts`** — exports `assertRequiredConfig`, the function under test. The test passes `[paymentsModule]` into it and asserts throw/no-throw behavior.
- **`src/modules/payments/module.ts`** — the module whose manifest (including its `customCheck`) is exercised. Imported as `paymentsModule` and handed to `assertRequiredConfig`.
- **`tests/support/environment.ts`** — exports `withoutEnvironmentInThisFile`, used to guarantee env-var isolation for this test file.

## Notes

- The gate **short-circuits when `NODE_ENV === 'test'`**, so every case must set `NODE_ENV` to something else (`development` or `production`) or the assertions will be vacuous. The file header calls this out explicitly.
- This file deliberately excludes `validateBankTransferConfig` cases and `validateStripeSecretKey` pure-logic cases; those live in a sibling `config.test.ts`.
- The Stripe section contains exactly **one** test. Its stated purpose is to prove the manifest *wires* the validator into `assertRequiredConfig`—a build that omitted the wiring would pass the other three Stripe cases but fail this one.
