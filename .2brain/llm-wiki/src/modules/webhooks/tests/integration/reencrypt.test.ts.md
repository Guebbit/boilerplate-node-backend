---
source: src/modules/webhooks/tests/integration/reencrypt.test.ts
sha256: 236b21cb1a175f77e43c9d41749d6ef2d3fb72baa9617b3a0ca5b54e49fbf2c9
generated_at: 2026-10-29T06:32:15.681126+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/reencrypt.test.ts

## Purpose

Integration test verifying the webhook key-rotation "reencrypt" walk: after a ring secret stamped `v1` is re-encrypted under a new `v2` key, the ciphertext version stamp updates and the secret still decrypts to a valid `whsec_` entry id.

## Key elements

- **`ROTATED_WEBHOOK_KEY`** – Simulates a mid-rotation manifest (`v2` key in front, the bare `v1` test key behind) used as the `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` env override.
- **`describe('webhooks reencrypt')` block** – Single test that:
  1. Creates a user and a webhook subscription.
  2. Swaps the encryption-key env var to the rotated manifest via `withEnvironmentOverrides`.
  3. Calls `webhooksModule.reencrypt(false)` and asserts `report.rewritten === 1`.
  4. Reads the raw document from the Mongo collection (bypassing repository decryption) to confirm the stored ciphertext is stamped `v2` and still decrypts to a `whsec_` token.

## Relationships

- **`webhooksModule`** (`module.ts`) – Under test; its `reencrypt()` method performs the version-bump walk.
- **`decryptRingSecret`** (`secrets.ts`) – Used to prove the re-encrypted blob still decodes to the original `whsec_` entry id.
- **`webhookSubscriptionModel`** (`model.ts`) – Accesses the raw collection to inspect the stored ciphertext without going through the repository's decrypt layer.
- **`keyVersionOf`** (`versioned-secret.ts`) – Reads the version prefix out of the ciphertext string.
- **`create`** (`services/subscriptions.ts`) – Seeds a subscription whose ring secret will be re-encrypted.
- **`createUser`** (`users/tests/factories.ts`) – Creates the owning user record.
- **`callerAs`** (`tests/support/callers.ts`) – Provides the `manager` caller context for subscription creation.
- **`withEnvironmentOverrides`** (`tests/support/environment.ts`) – Temporarily replaces `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` for the duration of the assertion block.
- **`setupTestDb`** (`tests/support/setup-test-db.ts`) – Initializes the in-memory / temp database before the suite runs.

## Notes

- The test deliberately reads the raw Mongo document (`webhookSubscriptionModel.collection.findOne`) rather than going through the repository, so it can assert on the *stored* version stamp without the repository re-decrypting first.
- `reencrypt(false)` — the `false` argument signals an actual rewrite (not a dry run); the test asserts exactly one document was rewritten.
- The key manifest is a comma-separated list where position encodes priority (newest first); the test exploits this ordering to simulate a rotation where `v2` is now the active key.
