---
source: src/modules/webhooks/tests/unit/module.test.ts
sha256: e2fd67dd86ce776f686d8c9867aad0ebfd5f32a622b6daef5fb8d992e08142f6
generated_at: 2026-11-08T09:10:15.895006+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/module.test.ts

## Purpose

Unit tests for the webhooks module's boot-time configuration gate and its registration warning. It verifies that `assertModuleConfig` enforces a valid `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` (present, non-placeholder, 32-byte hex/base64) and that `onRegistered` warns when no message broker is configured.

## Key elements

- **`TOUCHED`** — readonly list of every env var the suite touches; passed to `withoutEnvironmentInThisFile` so each is cleared before every case and restored after the file finishes.
- **`configure()`** — sets `NODE_ENV=development`, `NODE_URL`, and a valid 64-char hex key, giving tests a known-good baseline to mutate one field at a time.
- **`describe('the secret-ring encryption key')`** — four cases: key unset, key equals the shipped placeholder string, key is 32+ chars but not valid hex/base64 for 32 bytes, and a correct key (expects no throw).
- **`describe('the boot warning')`** — spies on `logger.warn`; asserts a "no message broker" warning fires when RabbitMQ vars are absent and stays silent when `NODE_RABBITMQ_URL` is set.

## Relationships

- **`src/kernel/module-config.ts`** — imports `assertModuleConfig`, the function under test.
- **`src/modules/webhooks/module.ts`** — imports the `webhooksModule` default export; passes it as the subject to `assertModuleConfig` and calls its `onRegistered` hook.
- **`tests/support/environment.ts`** — imports `withoutEnvironmentInThisFile` (file-level env isolation) and `setEnvironment` (per-case overrides).
- **`src/infrastructure/adapters/logger.ts`** — imports the `logger` singleton solely to spy on its `warn` method during the boot-warning cases.

## Notes

- Every case must set `NODE_ENV` away from `"test"` (done inside `configure`); the gate short-circuits under the test environment, so a suite that skipped this would assert nothing.
- The placeholder check is against the literal string `'your-webhook-secret-encryption-key-here'` — if the shipped default changes, this test must follow.
- The "32 characters but not 32 bytes" case (`'a-real-32-byte-webhook-secret-key!!'`) documents that length alone is insufficient; the key must decode to exactly 32 bytes of hex or base64.
- Logger spy uses `mockImplementation(() => logger)` to preserve any chaining behavior of the real `warn`.
