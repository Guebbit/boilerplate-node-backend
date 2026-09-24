---
source: src/modules/webhooks/tests/unit/module.test.ts
sha256: 115d4f8e0ef798e4ece8649f60563eeb61668cd7e31bc2a0c32cea62abde2f42
generated_at: 2026-09-23T19:45:01.824119+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/module.test.ts

## Purpose

Unit tests for the webhooks module's boot-time config gate. Verifies two real rules: `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` must be present (and not a placeholder), and `NODE_WEBHOOK_DEMO_SINK_URL` must be unset in production. Exercises `assertRequiredConfig` against the actual webhooks manifest rather than a synthetic one.

## Key elements

- **`TOUCHED`** – readonly list of every env var the suite reads or writes; passed to `withoutEnvironmentInThisFile` for isolation.
- **`configure()`** – sets a minimal valid development environment (`NODE_ENV=development`, `NODE_URL`, a real 32-byte key) so each case can break exactly one thing.
- **`describe('the secret-ring encryption key')`** – three cases: unset → throws, shipped placeholder → throws, real key → passes.
- **`describe('the demo-sink exemption')`** – three cases: set in non-production → passes, set in production → throws, unset in production → passes.

## Relationships

- **`src/kernel/required-config.ts`** – provides `assertRequiredConfig`, the function under test.
- **`src/modules/webhooks/module.ts`** – the manifest whose declared `requiredConfig` entries drive both assertions.
- **`tests/support/environment.ts`** – provides `withoutEnvironmentInThisFile`, which snapshots and restores the `TOUCHED` vars around the file.

## Notes

- Every case explicitly sets `NODE_ENV` to `development` or `production`. The gate short-circuits under `test`, so a suite that left it alone would assert nothing.
- The production demo-sink case also sets `NODE_CORS_ORIGIN`; without it the validation chain likely fails earlier for an unrelated reason.
- The placeholder value `'your-webhook-secret-encryption-key-here'` is hard-coded in the test; if the manifest's rejected-value list changes, this case must be updated in lockstep.
