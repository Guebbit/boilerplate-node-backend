---
source: src/modules/webhooks/secrets.ts
sha256: da9979bc439854d8e36fa869446960f12ed65f4c66a8d69d5ce89129e974e49b
generated_at: 2026-10-29T06:29:10.005463+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/secrets.ts

## Purpose

Secret-ring encryption at rest and the ring operations built on it (mint, rotate, drop). Delegates actual AES-256-GCM encryption to `versioned-secret` under a versioned key ring from config, and keeps plaintext secrets in memory only for the duration of a single mint response or one delivery-attempt signature.

## Key elements

- **`generatePlaintextSecret`** (internal) – produces a Standard-Webhooks-compatible secret: `whsec_` + 32 random bytes, base64-encoded.
- **`ringSecretBinding(entryId)`** – returns the `SecretBinding` (purpose `"webhook-secret"`, AAD = entry id) used by both encrypt and decrypt. Also the binding a re-encryption job rewraps under.
- **`encryptRingSecret(plaintext, entryId)`** – encrypts a secret for storage via `encryptVersionedSecret` with the shared key ring.
- **`decryptRingSecret(stored, entryId)`** – reverses the above; throws on malformed format, wrong key, or auth-tag mismatch.
- **`mintRingSecret()`** – generates a new `WebhookSecretRingEntry` (random UUID + ciphertext + timestamp) and returns it alongside the one-time plaintext.
- **`liveRingEntries(ring, now?)`** – filters a ring (oldest-first) to entries still in force: the newest never expires; an older one retires once its successor has been live for the overlap window (`NODE_WEBHOOK_SECRET_OVERLAP_HOURS`).
- **`retiringRingSecrets(ring, now?)`** – from the live entries, returns the superseded ones with their computed `retiresAt` timestamp (successor's `createdAt` + overlap). The newest is excluded.
- **`activeRingSecrets(ring, now?)`** – decrypts all live entries in ring order (oldest first), which matches the `webhook-signature` header ordering for consumers.
- **`removeRingSecret(ring, id)`** – drops a single entry by id (second half of rotation, after all consumers have switched).

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** – provides `encryptVersionedSecret`, `decryptVersionedSecret`, and the `SecretBinding` type that this module wraps.
- **`src/modules/webhooks/config.ts`** – source of `getWebhookEncryptionKeyRing` (the key ring) and `getWebhookSecretOverlapMs` (the retirement window).
- **`src/modules/webhooks/model.ts`** – defines the `WebhookSecretRingEntry` shape used throughout.
- **`src/modules/webhooks/services/attempt.ts`** – consumer of `activeRingSecrets` to obtain plaintexts for signing a delivery.
- **`src/modules/webhooks/services/reencrypt.ts`** – rewraps stored ciphertexts under a new key version; depends on `ringSecretBinding` to reproduce the AAD.
- **`src/modules/webhooks/services/subscriptions.ts`** – calls `mintRingSecret` / `removeRingSecret` during subscription rotation.
- **`src/modules/webhooks/services/actions.ts`** – higher-level webhook actions that trigger ring mutations.
- **`src/modules/webhooks/tests/unit/secrets.test.ts`** and the integration tests (`delivery.test.ts`, `fan-out.test.ts`, `reencrypt.test.ts`, `subscription-lifecycle.test.ts`, `sweep.test.ts`, `delivery-log.test.ts`) – exercise the exported functions in isolation and end-to-end.
- **`scenarios/webhooks.ts`** – test scenario fixtures that set up rings and secrets for integration tests.

## Notes

- The `entryId` is used as AAD (not the parent subscription id) because a subscription's `_id` may not yet exist when its first secret is minted.
- Ring order is **oldest first** everywhere; this is intentional so that the `webhook-signature` header lists the soonest-to-retire secret first and the newest last, matching Standard-Webhooks consumer expectations.
- `activeRingSecrets` will decrypt entries that are live but already superseded (within the overlap window); it does not skip them—only fully expired ones are excluded.
- The plaintext returned by `mintRingSecret` is meant to be handed to the caller **exactly once** (HTTP response); it is never persisted.
