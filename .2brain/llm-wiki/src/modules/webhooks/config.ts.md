---
source: src/modules/webhooks/config.ts
sha256: 7b25432c47fa04eb4979ba97835960a6bac976411edc4d58ac4b7940869258a0
generated_at: 2026-10-15T12:17:39.824692+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/config.ts

## Purpose

Environment-derived configuration for the webhook delivery subsystem. Values are read per call (not captured at import time) so tests can vary them per case; a deployment changes a value via env + restart. Holds the secret-encryption key ring, the per-tenant subscription cap, the secret-overlap window, and the delivery-retention TTL.

## Key elements

- **`webhooksConfig`** — `defineConfig` object (`name: 'webhooks'`) exposing four fields: `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` (versioned key ring), `NODE_WEBHOOK_SUBSCRIPTION_CAP` (int, default 20), `NODE_WEBHOOK_SECRET_OVERLAP_HOURS` (int, default 24), `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` (int, default 30).
- **`getWebhookEncryptionKeyRing(): VersionedKey[]`** — Parses and returns the versioned key ring used to encrypt stored subscription secrets.
- **`getWebhookSubscriptionCap(): number`** — Per-tenant subscription limit; the fan-out guard checked before every subscription create.
- **`getWebhookSecretOverlapMs(): number`** — Overlap window (ms) during which a superseded secret still validates signatures (Standard Webhooks bounded overlap).
- **`getWebhookDeliveryRetentionDays(): number`** — How long a delivery row lives before Mongo TTL purges it.

## Relationships

- **`@infrastructure/config/define`** — Provides `defineConfig`, the factory used to declare the config shape.
- **`@infrastructure/config/fields`** — Provides `int` and `versionedKeyRing` validators consumed in the shape definition.
- **`@infrastructure/security/versioned-secret`** — Source of the `VersionedKey` type returned by `getWebhookEncryptionKeyRing`.
- **`src/modules/webhooks/secrets.ts`** — Consumes the key ring to encrypt/decrypt subscription secrets at rest.
- **`src/modules/webhooks/services/subscriptions.ts`** — Calls `getWebhookSubscriptionCap` before create and again by insertion rank to close a concurrent-boundary race.
- **`src/modules/webhooks/services/reencrypt.ts`** — Re-encrypts stored secrets when the key ring is rotated; depends on the key ring shape defined here.
- **`src/modules/webhooks/model.ts`** — Reads `getWebhookDeliveryRetentionDays` at import time to create the Mongo TTL index (created once at startup, unlike the other per-call getters).
- **`src/modules/webhooks/module.ts`** — Module entry point that wires the above services together.

## Notes

- **Per-call vs. import-time:** All getters re-read env on each invocation *except* `getWebhookDeliveryRetentionDays`, which is effectively fixed at startup because the model creates the TTL index once. Changing retention after boot has no effect until restart.
- **Encryption key is a versioned ring, not a scalar.** The wire format is documented in `parseVersionedKeyRing` (see `versioned-secret.ts`). The shipped placeholder string is a deliberate fail-loud default — deploying with it means every stored secret is recoverable by anyone with repo read access.
- **Subscription cap double-check:** `subscriptions.ts` performs a count check *and* an insertion-rank check; a single check cannot close the race between two concurrent callers at the boundary.
