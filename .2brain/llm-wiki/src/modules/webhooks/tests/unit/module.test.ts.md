---
source: src/modules/webhooks/tests/unit/module.test.ts
sha256: e2fd67dd86ce776f686d8c9867aad0ebfd5f32a622b6daef5fb8d992e08142f6
generated_at: 2026-10-15T12:24:55.812096+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/module.test.ts

## Purpose

Unit test for the webhooks module's boot-time configuration gate. It verifies that `assertModuleConfig` rejects invalid or missing `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` values and that the module emits a boot warning when no message broker is configured. It exercises the gate through the real `assertModuleConfig` call (not by inspecting the manifest directly), ensuring the manifest wiring is part of what makes the check fire.

## Key elements

- **`TOUCHED`** – Frozen list of every environment variable the gate reads; cleared before each case and restored after the file via `withoutEnvironmentInThisFile`.
- **`configure()`** – Helper that sets a fully valid deployment (`NODE_ENV=development`, `NODE_URL`, a 64-char hex key) so individual cases can break exactly one thing.
- **`describe('the secret-ring encryption key')`** – Four cases: unset key, shipped placeholder string, a long-but-invalid value, and a valid 32-byte hex key. Each asserts `assertModuleConfig([webhooksModule], [])` throws (or doesn't).
- **`describe('the boot warning')`** – Two cases that spy on `logger.warn`, call `webhooksModule.onRegistered([])`, and assert the "no message broker" warning appears only when `NODE_RABBITMQ_URL`/`PORT` are absent.

## Relationships

- **`src/kernel/module-config.ts`** – Provides `assertModuleConfig`, the function under test; called with the webhooks module as the sole subject.
- **`src/modules/webhooks/module.ts`** – The `webhooksModule` default export is passed to `assertModuleConfig` and invoked via `onRegistered` to trigger the broker warning path.
- **`tests/support/environment.ts`** – Supplies `withoutEnvironmentInThisFile` (file-level env hygiene) and `setEnvironment` (per-case setup/teardown).
- **`src/infrastructure/adapters/logger.ts`** – Spied on (`logger.warn`) to assert the boot-warning behavior without side effects.

## Notes

- Every test sets `NODE_ENV` to a non-`test` value (`development`). The gate short-circuits under `test`, so leaving the default would make all assertions vacuously pass.
- The key validator checks for 32 bytes of hex **or** base64, not merely a character-count threshold — the "long but invalid" case (`'a-real-32-byte-webhook-secret-key!!'`) documents this distinction.
- The test intentionally drives validation through `assertModuleConfig` rather than reading the manifest's config fields, matching the rationale in `products/tests/unit/config.test.ts`: the manifest wiring is half of the check.
