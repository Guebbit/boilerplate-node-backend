---
source: src/modules/payments/tests/unit/module.test.ts
sha256: 6d0a2df7d994920df4f43c9890d3dc26bad4fe161888f24149f34e268361360f
generated_at: 2026-10-15T11:38:23.206326+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/module.test.ts

## Purpose

Unit tests for the payments module's **boot-time configuration gate** (`assertModuleConfig`). Covers two validation concerns from the module manifest: the `NODE_PAYMENT_PROVIDER` selector (accepted / rejected / unset) and the `NODE_PAYMENT_WEBHOOK_SECRET` (optional, minimum length, comma-separated rotation ring, placeholder rejection in production). The file deliberately does **not** test `validateBankTransferConfig`; those cases live in a sibling `config.test.ts`.

## Key elements

- **`configure()`** — local helper that sets `NODE_ENV` to `'development'`. Every test calls this (or sets `NODE_ENV` directly) before asserting, because the gate short-circuits under `NODE_ENV=test`.
- **`describe('the payment provider selector')`** — three cases: unset var is allowed (no card payments), a registered name (`'fake'`) is accepted, an unrecognised name throws with a message mentioning `NODE_PAYMENT_PROVIDER`.
- **`describe('the payment webhook secret')`** — six cases: unset is fine even in production; < 16 chars rejected; a valid comma-separated ring accepted; a ring with one short entry rejected; a trailing comma (empty entry) rejected; the literal `.env-example` placeholder rejected in production.
- **`withoutEnvironmentInThisFile([...])`** — file-level guard (from `@tests/environment`) that deletes the three relevant env vars before the suite runs, preventing leakage from CI or shell.

## Relationships

- **`src/kernel/module-config.ts`** — provides `assertModuleConfig`, the function under test. The test calls it with `[paymentsModule]` and an empty second argument (no extra checks).
- **`src/modules/payments/module.ts`** — the `paymentsModule` export passed into `assertModuleConfig`; its manifest slice (provider + webhook checks) is what the assertions exercise.
- **`tests/support/environment.ts`** — supplies `withoutEnvironmentInThisFile` (file-scoped env cleanup) and `setEnvironment` (per-test env mutation).

## Notes

- `NODE_ENV` **must** be set away from `'test'` in every test; the gate silently passes under the test environment, so forgetting this yields false-green suites.
- The webhook secret supports a **comma-separated ring** (e.g. for key rotation). Validation requires *every* entry to be ≥ 16 chars; an empty entry (trailing comma) is treated as a violation, not ignored.
- The placeholder value `'your-payment-webhook-secret-here'` is rejected **only** when `NODE_ENV=production`; the same string would pass in development.
- The file intentionally leaves `NODE_PAYMENT_PROVIDER` unset in the webhook-secret tests so that the two concerns are tested independently.
