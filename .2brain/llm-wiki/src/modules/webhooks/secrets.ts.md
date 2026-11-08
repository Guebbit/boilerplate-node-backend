---
source: src/modules/webhooks/secrets.ts
sha256: da9979bc439854d8e36fa869446960f12ed65f4c66a8d69d5ce89129e974e49b
generated_at: 2026-11-08T09:05:15.088721+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/secrets.ts

## Purpose

Implements the secret-ring lifecycle for webhook subscriptions: minting, encrypting at rest, determining which secrets are still valid, and retiring superseded ones. It wraps the versioned-secret encryption primitives with webhook-specific binding and a time-based overlap window so a rotation never causes a verification gap.

## Key elements

- **`generatePlaintextSecret`** (internal) — produces a Standard-Webhooks-compatible secret: `whsec_` + 32 random bytes, base64-encoded.
- **`ringSecretBinding(entryId)`** — builds the `SecretBinding` (`purpose: 'webhook-secret'`, `aad: entryId`) shared by encrypt/decrypt and re-encryption jobs.
- **`encryptRingSecret(plaintext, entryId)`** — encrypts a plaintext secret under the webhook key ring, bound to the entry's id.
- **`decryptRingSecret(stored, entryId)`** — reverses the above; throws on malformed input, wrong key, or tag mismatch.
- **`mintRingSecret()`** — generates a new `WebhookSecretRingEntry` (random UUID, ciphertext, `createdAt`) and returns it alongside the plaintext exactly once for the caller to surface over HTTP.
- **`liveRingEntries(ring, now?)`** — returns the entries still valid at `now`; the newest never expires, an older one remains live while its successor is within the overlap window.
- **`retiringRingSecrets(ring, now?)`** — for each live-but-superseded entry, returns `{ id, retiresAt }` (successor's `createdAt` + overlap).
- **`activeRingSecrets(ring, now?)`** — decrypts all live entries in ring order (oldest first), the set a delivery attempt signs with.
- **`removeRingSecret(ring, id)`** — filters one entry out by id (the drop step after consumers have switched).

## Relationships

- **`@infrastructure/security/versioned-secret`** — provides `encryptVersionedSecret`, `decryptVersionedSecret`, and the `SecretBinding` type; this file is a thin webhook-domain wrapper around them.
- **`src/modules/webhooks/config.ts`** — supplies `getWebhookEncryptionKeyRing()` (the AES-256-GCM key ring from `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`) and `getWebhookSecretOverlapMs()` (the overlap window from `NODE_WEBHOOK_SECRET_OVERLAP_HOURS`).
- **`src/modules/webhooks/model.ts`** — defines `WebhookSecretRingEntry`, the shape of each ring element used throughout this file.
- **`src/modules/webhooks/services/attempt.ts`** — consumes `activeRingSecrets` to obtain the plaintexts for HMAC signing during delivery.
- **`src/modules/webhooks/services/reencrypt.ts`** — rewraps stored ciphertexts under a new key ring, reusing `ringSecretBinding` for the AAD.
- **`src/modules/webhooks/tests/unit/secrets.test.ts`** — unit tests for every exported function.
- **`src/modules/webhooks/tests/integration/*.test.ts`** — integration tests exercise mint → rotate → drop flows through the subscription lifecycle, fan-out, sweep, and re-encryption paths.

## Notes

- The AAD is the **entry's own `id`**, not the parent subscription's `_id`, because the first secret is minted before the subscription document has a persisted id.
- `activeRingSecrets` preserves ring order (oldest first), which matches the order a `webhook-signature` header lists its `t=` values: the soonest-to-retire secret appears first, the newest last.
- The overlap window is the *only* thing bounding how long a superseded secret can still sign; there is no hard revocation before the window elapses.
- Plaintext exists only in memory: during mint (returned once over HTTP) and during a single delivery attempt for signing. It is never persisted.
