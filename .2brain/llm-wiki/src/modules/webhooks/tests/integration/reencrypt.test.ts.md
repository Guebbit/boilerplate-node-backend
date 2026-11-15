---
source: src/modules/webhooks/tests/integration/reencrypt.test.ts
sha256: 32f407d6b9d02697218dc42ffd5ed43d0929daeb0f9bd6f216234e3f6e3d0930
generated_at: 2026-11-14T22:50:26.069107+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/reencrypt.test.ts

## Purpose

Integration test for the webhook ring-secret key-rotation flow. It verifies that after a `v1`→`v2` key rotation, the `reencrypt` walk rewrites the stored ciphertext to the new version while the secret still decrypts correctly under its entry id. The test reads the raw collection document (below the repository's own decrypt layer) to inspect the version stamp directly.

## Key elements

- **`ROTATED_WEBHOOK_KEY`** — A two-segment key string (`v2:…,v1:…`) simulating a deployment mid-rotation where the new key is front and the old test key is behind.
- **`describe('webhooks reencrypt')`** — Single test case that:
  - Creates a user, then an admin-owned `*`-stream subscription (the `*` wildcard requires admin read rules).
  - Runs `webhooksModule.reencrypt(false)` inside `withEnvironmentOverrides` with the rotated key.
  - Asserts `report.rewritten === 1`.
  - Fetches the raw document via `webhookSubscriptionModel.collection.findOne` and checks `keyVersionOf(ciphertext) === 'v2'`.
  - Confirms `decryptRingSecret` still yields a token matching `/^whsec_/`.

## Relationships

- **`src/modules/webhooks/module.ts`** — Imports the default `webhooksModule` export; the test invokes `reencrypt` on it.
- **`src/modules/webhooks/model.ts`** — Imports `webhookSubscriptionModel` to read the raw (un-decrypted) collection document.
- **`src/modules/webhooks/services/subscriptions.ts`** — Imports `create` to seed a subscription with a `*` event-type stream.
- **`src/modules/webhooks/secrets.ts`** — Imports `decryptRingSecret` to prove the rotated ciphertext still round-trips.
- **`src/infrastructure/security/versioned-secret.ts`** — Imports `keyVersionOf` to assert the stamped version is `v2`.
- **`src/modules/users/tests/factories.ts`** — Imports `createUser` to seed the user that owns the subscription.
- **`tests/support/setup-test-db.ts`** — Imports `setupTestDb` to initialise the in-memory DB for the test run.
- **`tests/support/callers.ts`** — Imports `callerAs` to build the admin identity required for the `*` stream.
- **`tests/support/response.ts`** — Imports `asSuccess` to unwrap the `Either` returned by `createSubscription`.
- **`tests/support/environment.ts`** — Imports `withEnvironmentOverrides` to inject `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` scoped to the reencrypt call.

## Notes

- The test intentionally reads the **raw** collection document (`model.collection.findOne`) rather than going through the repository, because the repository would decrypt and hide the version stamp. `keyVersionOf` is applied to the stored ciphertext, not the decrypted value.
- The `*` event-type stream is restricted to admin callers; a non-admin subscription would fail at creation, which is why `callerAs('admin')` is required.
- The rotated key constant embeds both the new (`v2`) and the legacy test key (`v1:test-webhook-secret-encryption-key`) in a single comma-separated value, mimicking a production key ring during rotation.
