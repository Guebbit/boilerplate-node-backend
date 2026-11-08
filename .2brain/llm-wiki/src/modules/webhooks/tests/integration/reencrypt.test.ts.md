---
source: src/modules/webhooks/tests/integration/reencrypt.test.ts
sha256: 236b21cb1a175f77e43c9d41749d6ef2d3fb72baa9617b3a0ca5b54e49fbf2c9
generated_at: 2026-11-08T09:08:58.074117+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the `reencrypt` walk in the webhooks module. It verifies that after a webhook-secret key rotation (v1 → v2), a ring secret still stamped `v1` is re-stamped to `v2` and remains decryptable under its entry id. It inspects the raw ciphertext below the repository's own decryption layer to confirm the version bump actually happened.

## Key elements

- **`ROTATED_WEBHOOK_KEY`** — Constant holding a two-entry key manifest (`v2:…,v1:…`) that simulates a deployment mid-rotation: the new v2 key in front, the worker's original v1 test key behind.
- **`describe('webhooks reencrypt')` / single `it`** — Creates a user and a webhook subscription (encrypted under v1), then calls `webhooksModule.reencrypt(false)` inside `withEnvironmentOverrides` with the rotated manifest. Asserts `report.rewritten === 1`, reads the raw document via `webhookSubscriptionModel.collection.findOne`, and checks `keyVersionOf(ciphertext) === 'v2'` and that `decryptRingSecret` still yields a `whsec_…` value.

## Relationships

- **`src/modules/webhooks/module.ts`** — The unit under test; its `reencrypt` method is invoked directly.
- **`src/modules/webhooks/secrets.ts`** — `decryptRingSecret` is used to prove the re-stamped ciphertext is still functional.
- **`src/modules/webhooks/model.ts`** — `webhookSubscriptionModel.collection` is used to read the raw stored document (bypassing the model's decrypt) so the version stamp is visible.
- **`src/modules/webhooks/services/subscriptions.ts`** — `create` seeds a subscription whose ring secret the reencrypt walk will migrate.
- **`src/infrastructure/security/versioned-secret.ts`** — `keyVersionOf` extracts the version prefix from a ciphertext for the assertion.
- **`src/modules/users/tests/factories.ts`** — `createUser` provides the required parent user for the subscription.
- **`tests/support/callers.ts`** — `callerAs('manager')` supplies the caller context for subscription creation.
- **`tests/support/environment.ts`** — `withEnvironmentOverrides` scopes the rotated key manifest to the duration of the reencrypt call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` is invoked at module load to prepare a clean database.

## Notes

- The subscription is created **before** the environment override, so it is encrypted under the original v1 key; the rotation manifest is only visible inside the `withEnvironmentOverrides` callback. This ordering is what makes the test meaningful.
- The test reads the collection directly (`collection.findOne`) rather than through the model's `find`/`findOne`, deliberately bypassing the repository's built-in decryption to observe the raw version stamp.
- `reencrypt(false)` — the `false` argument is passed positionally; it is not documented in this file, so consult `module.ts` for its meaning (likely a flag to skip a secondary action).
