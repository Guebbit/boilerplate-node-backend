---
source: src/modules/payments/tests/unit/module.test.ts
sha256: 6d0a2df7d994920df4f43c9890d3dc26bad4fe161888f24149f34e268361360f
generated_at: 2026-11-08T07:40:04.316314+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/module.test.ts

## Purpose

Boot-time configuration validation tests for the payments module. It verifies that `assertModuleConfig` correctly accepts, rejects, or short-circuits the two environment-variable checks that belong to this file: the `NODE_PAYMENT_PROVIDER` selector and the `NODE_PAYMENT_WEBHOOK_SECRET` ring. The goal is to surface misconfiguration at startup rather than on the first payment call.

## Key elements

- **`configure()`** – Local helper that sets `NODE_ENV` to `development`, giving each test a baseline that passes all unconditional checks so it can isolate a single failing condition.
- **`withoutEnvironmentInThisFile([...])`** (module scope) – Clears `NODE_ENV`, `NODE_PAYMENT_PROVIDER`, and `NODE_PAYMENT_WEBHOOK_SECRET` before any test runs, guaranteeing a clean starting state.
- **`describe('the payment provider selector')`** – Three cases: unset provider is fine (no card payments), a registered name (`fake`) is accepted, an unrecognized name throws a message matching `/NODE_PAYMENT_PROVIDER/`.
- **`describe('the payment webhook secret')`** – Six cases covering: unset secret (OK even in production), value under 16 chars (throws), a valid comma-separated ring (OK), a ring with a short second entry (throws), a trailing comma producing an empty entry (throws), and the `.env-example` placeholder in production (throws).

## Relationships

- **`src/kernel/module-config.ts`** – Source of `assertModuleConfig`, the function every test calls. This file exercises only the payments-related slice of that check.
- **`src/modules/payments/module.ts`** – Provides the `paymentsModule` default export, passed as the module argument to `assertModuleConfig`; its manifest defines which env vars are inspected.
- **`tests/support/environment.ts`** – Provides `withoutEnvironmentInThisFile` (isolation guard) and `setEnvironment` (per-test env mutation) used throughout.

## Notes

- **`NODE_ENV` must be set to something other than `test` in every case.** The config gate short-circuits under the test environment; a test that forgets `configure()` (or the explicit `setEnvironment({ NODE_ENV: 'production' })` calls) will pass silently without asserting anything meaningful.
- **Scope boundary:** `validateBankTransferConfig` tests live in a sibling `config.test.ts`; this file intentionally covers only the provider-selector and webhook-secret halves of the manifest's combined slice check.
- The webhook-secret ring format is comma-separated; an empty entry (e.g. trailing comma) is treated as "no secret" and rejected, not silently skipped.
