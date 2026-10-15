---
source: src/modules/webhooks/secrets.ts
sha256: 7d5d4c6b3182cbb8901eae7f771e9ef2fd4ed8fb41a7537c212816ba45740c7c
generated_at: 2026-10-15T12:20:33.676067+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/secrets.ts

## Purpose

Provides the secret-ring lifecycle operations (mint, rotate, drop) and the encrypt/decrypt helpers that keep webhook signing secrets at rest. The actual AES-256-GCM encryption is delegated to the shared versioned-secret infrastructure; this file adds the domain-specific binding, ring-entry shape, overlap-window expiry logic, and Standard-Webhooks-format secret generation on top.

## Key elements

- **`generatePlaintextSecret`** (private) – Returns `whsec_` + 32 random bytes in base64, matching the Standard-Webhooks encoding expected by consumer signing libraries.
- **`ringSecretBinding(entryId)`** – Builds the `SecretBinding` (`purpose: 'webhook-secret'`, `aad: entryId`) used for both encryption and re-encryption. The entry `id` is the AAD because the parent subscription may not have a stable `_id` yet at mint time.
- **`encryptRingSecret(plaintext, entryId)`** – Encrypts a secret into its stored ciphertext via `encryptVersionedSecret` with the webhook key ring.
- **`decryptRingSecret(stored, entryId)`** – Decrypts a stored ciphertext; throws on malformed format, wrong key, or auth-tag mismatch.
- **`mintRingSecret()`** – Generates a fresh `WebhookSecretRingEntry` (with `id`, `ciphertext`, `createdAt`) and returns it alongside the one-time plaintext for the HTTP response.
- **`liveRingEntries(ring, now?)`** – Filters the ring (oldest-first) to entries still in force: the newest never expires; an older one expires once its successor has been live longer than the overlap window (`NODE_WEBHOOK_SECRET_OVERLAP_HOURS`).
- **`activeRingSecrets(ring, now?)`** – Returns every live entry's decrypted plaintext, preserving ring order (oldest first) so the `webhook-signature` header lists the soon-to-retire secret first and the active one last.
- **`removeRingSecret(ring, id)`** – Drops a single entry by id (the "second half of rotation").

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** – Supplies `encryptVersionedSecret`, `decryptVersionedSecret`, and the `SecretBinding` type that underpin all crypto in this file.
- **`src/modules/webhooks/config.ts`** – Provides `getWebhookEncryptionKeyRing` (the key ring, backed by `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`) and `getWebhookSecretOverlapMs` (the overlap window in milliseconds).
- **`src/modules/webhooks/model.ts`** – Defines `WebhookSecretRingEntry`, the stored shape (id, ciphertext, createdAt) used throughout this module.
- **`src/modules/webhooks/services/attempt.ts`** – Calls `activeRingSecrets` to obtain the plaintexts used to sign a delivery attempt's `webhook-signature` header.
- **`src/modules/webhooks/services/reencrypt.ts`** – Re-encrypts stored ciphertexts under a new key version; rewraps using the same `ringSecretBinding` contract.
- **`src/modules/webhooks/services/subscriptions.ts`** – Orchestrates mint/rotate/drop by calling `mintRingSecret`, `liveRingEntries`, and `removeRingSecret` during subscription lifecycle operations.
- **`src/modules/webhooks/tests/unit/secrets.test.ts`** – Unit tests covering each exported function in isolation.
- **`src/modules/webhooks/tests/integration/*.test.ts`** – Integration suites (delivery, re-encryption, subscription lifecycle, sweep) that exercise these functions through service-level flows.

## Notes

- The plaintext secret is intentionally short-lived: it exists in memory only during the HTTP response (mint) or for the duration of a single delivery attempt (signing). `WebhookSubscriptionDocument.secrets` never stores it.
- Ring order is semantically significant: oldest-first matches the order consumers see in the `webhook-signature` header (retiring secret first, active secret last).
- The entry `id` (not the subscription id) is the AAD binding because a subscription may lack a stable `_id` at the moment its first secret is minted. Any re-encryption path must pass the same `entryId`.
- `liveRingEntries` uses the *successor's* `createdAt` (not the entry's own) to decide expiry, so the overlap window is measured from when the replacement went live.
