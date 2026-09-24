---
source: src/modules/payments/tests/unit/module.test.ts
sha256: 9102262f7c7a2b4abe1c7148fe8b0ca46931fae4a85843bc23cd5e71bd4932d4
generated_at: 2026-09-23T19:24:17.156312+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/tests/unit/module.test.ts

## Purpose

Unit tests for the provider-selector half of the payments module's `customCheck` manifest entry. Verifies that an unrecognized `NODE_PAYMENT_PROVIDER` value is rejected at boot time (via `assertRequiredConfig`) rather than discovered lazily on the first payment.

## Key elements

- **`configure()`** — local helper that sets `NODE_ENV` to `'development'`, ensuring the boot gate does not short-circuit under the test environment.
- **`withoutEnvironmentInThisFile(['NODE_ENV', 'NODE_PAYMENT_PROVIDER'])`** — file-scoped guard (from test support) that clears both variables before any case runs.
- **`describe('the payment provider selector', …)`** — three cases:
    - unset `NODE_PAYMENT_PROVIDER` → passes (implicit `fake` default)
    - explicit `fake` → passes
    - unrecognized value → throws with a message matching `/NODE_PAYMENT_PROVIDER/`

## Relationships

- **`src/kernel/required-config.ts`** — provides `assertRequiredConfig`, the function called in every assertion to trigger the module's `customCheck`.
- **`src/modules/payments/module.ts`** — the module under test; its manifest's `customCheck` is what `assertRequiredConfig` executes.
- **`tests/support/environment.ts`** — provides `withoutEnvironmentInThisFile`, which isolates env-var state for this file.

## Notes

- The gate short-circuits when `NODE_ENV === 'test'`, so every case must call `configure()` (or otherwise set `NODE_ENV` to something else) before asserting. A case that forgets this will pass silently without exercising any logic.
- The `validateBankTransferConfig` portion of the same `customCheck` is tested separately in `config.test.ts`; this file deliberately covers only the provider-selector half.
- The file-level doc comment makes the "boot gate" intent explicit: the goal is to surface misconfiguration at process start, not on the first real payment.
