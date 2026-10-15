---
source: src/modules/webhooks/tests/integration/reencrypt.test.ts
sha256: c81113a3bdd309b08217c1b46a227a3b86c4e6aaa0623cbc8c89c1a0186d4200
generated_at: 2026-10-15T12:23:52.107065+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/reencrypt.test.ts

## Purpose

Integration test that verifies the webhook key-rotation `reencrypt` walk: after deploying a new `v2` encryption key, a previously stamped `v1` ring secret is rewritten in-place to `v2` while remaining decryptable under its original entry id. It reads the raw collection document (bypassing the repository's decrypt layer) to assert the version stamp actually changed.

## Key elements

- **`ROTATED_WEBHOOK_KEY`** — Constant simulating a mid-rotation manifest: `v2:new-webhook-key-material,v1:test-webhook-secret-encryption-key`. Injected as `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` via `withEnvironment`.
- **`describe('webhooks reencrypt')`** — Single test that:
  1. Creates a user and a webhook subscription (`eventTypes: ['*']`).
  2. Calls `webhooksModule.reencrypt(false)` under the rotated-key environment.
  3. Asserts `report.rewritten === 1`.
  4. Reads the raw document from `webhookSubscriptionModel.collection` and checks `versionOf(ciphertext) === 'v2'`.
  5. Confirms `decryptRingSecret(ciphertext, entry.id)` still yields a `whsec_…` value.

## Relationships

- **`webhooks/module.ts`** — Source of the `reencrypt` entry point under test (`webhooksModule.reencrypt`).
- **`webhooks/secrets.ts`** — Provides `decryptRingSecret`, used to prove the rewritten ciphertext still round-trips.
- **`infrastructure/security/versioned-secret.ts`** — Provides `versionOf`, the function that inspects the version prefix stamped on a ciphertext.
- **`webhooks/model.ts`** — `webhookSubscriptionModel.collection` is queried directly (bypassing the repository) to observe the raw stored document.
- **`webhooks/services/subscriptions.ts`** — `create` builds the initial subscription fixture.
- **`users/tests/factories.ts`** — `createUser` supplies the owning user for the subscription.
- **`tests/support/environment.ts`** — `withEnvironment` temporarily sets the rotated-key env var around the test body.
- **`tests/support/callers.ts`** — `callerAs('manager')` produces the caller identity required by `createSubscription`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory Mongo used by the test.

## Notes

- The test reads the raw collection (`model.collection.findOne`) specifically to see the version stamp; the repository's own read path would transparently decrypt and hide the stamp.
- `reencrypt` is called with `false` (dry-run disabled). A `true` dry-run would presumably report without persisting — this test asserts the write path.
- The `v1` segment of `ROTATED_WEBHOOK_KEY` is the bare test key (`test-webhook-secret-encryption-key`), not a versioned prefix, reflecting that pre-rotation secrets carry no explicit stamp.
