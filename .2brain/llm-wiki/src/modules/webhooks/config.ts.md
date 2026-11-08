---
source: src/modules/webhooks/config.ts
sha256: 93c1fdab33213f9dec862dacaf1905c7332b9e454618f020a93166bf0cee79cc
generated_at: 2026-11-08T09:00:17.233996+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/config.ts

## Purpose

Defines the environment-derived configuration surface for the webhooks module (encryption key ring, per-tenant subscription cap, secret overlap window, delivery retention). Uses the read-per-call `defineConfig` pattern (same as `inventory/config.ts`) so tests can vary values per case without re-imports; a deployment changes a value via env var + restart.

## Key elements

- **`webhooksConfig`** — the `defineConfig` object. Declares four shape entries: `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` (versioned key ring, min 16 chars / 32 bytes), `NODE_WEBHOOK_SUBSCRIPTION_CAP` (int, default 20), `NODE_WEBHOOK_SECRET_OVERLAP_HOURS` (int, default 24), `NODE_WEBHOOK_DELIVERY_RETENTION_DAYS` (int, default 30).
- **`getWebhookEncryptionKeyRing()`** — returns the parsed `VersionedKey[]` ring used by `secrets.ts` to encrypt subscription secrets.
- **`getWebhookSubscriptionCap()`** — returns the max subscriptions one tenant may hold; the fan-out guard checked in `services/subscriptions.ts`.
- **`getWebhookSecretOverlapMs()`** — converts the overlap-hours setting to milliseconds (multiplied by `HOUR_MS`); the Standard Webhooks bounded-overlap window during which a superseded secret still signs.
- **`getWebhookDeliveryRetentionDays()`** — returns the retention period in days; consumed at import time by `model.ts` to create the Mongo TTL index.

## Relationships

- **`src/infrastructure/config/define.ts`** — `defineConfig` is the builder used to construct `webhooksConfig`.
- **`src/infrastructure/config/fields.ts`** — provides the `int` and `versionedKeyRing` field descriptors used in the shape definition.
- **`src/infrastructure/security/versioned-secret.ts`** — supplies the `VersionedKey` type that `getWebhookEncryptionKeyRing` returns.
- **`src/domain-primitives/time.ts`** — supplies `HOUR_MS`, the unit constant for the overlap calculation.
- **`src/modules/webhooks/secrets.ts`** — consumes the encryption key ring to encrypt/decrypt subscription secrets.
- **`src/modules/webhooks/services/reencrypt.ts`** — re-encrypts stored secrets when the key ring rotates (depends on the same ring getter).
- **`src/modules/webhooks/services/subscriptions.ts`** — reads `getWebhookSubscriptionCap` before every tenant-scoped insert.
- **`src/modules/webhooks/model.ts`** — reads `getWebhookDeliveryRetentionDays` at import time to build the TTL index (the one exception to the per-call pattern).
- **`src/modules/webhooks/module.ts`** — top-level module wiring that consumes the config getters.

## Notes

- The shipped placeholder for `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` is intentionally weak (mirrors the `NODE_TOTP_ENCRYPTION_KEY` failure shape). Deployments **must** override it; the `minLength`/`minBytes` guards only enforce format, not entropy.
- Retention days is the single value read at **import time** (by `model.ts`) rather than per-call, because the Mongo TTL index is created once at startup. All other getters are safe to call per-request.
- The subscription-cap check in `subscriptions.ts` is performed twice (pre-count and post-insert rank) to close a race between concurrent callers at the boundary — the config value is the shared constant both checks compare against.
