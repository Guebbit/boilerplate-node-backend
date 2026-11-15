---
source: src/modules/webhooks/secrets.ts
sha256: 278e987ce1d4f886241783d453d2f2e2530bc82a9e4e2b6c7360b06b8dcd8fe7
generated_at: 2026-11-14T22:44:55.438009+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/secrets.ts

## Purpose

Implements the secret-ring lifecycle for webhook subscriptions: minting, encrypting/decrypting at rest, determining which entries are still live or retiring, and dropping entries. Plaintext secrets exist only transiently (mint response, signing a delivery) and are never persisted in the subscription document.

## Key elements

- **`ringSecretBinding(entryId)`** – Builds the `SecretBinding` (HKDF purpose + AAD) used for encrypting/decrypting a single ring entry. The AAD is `webhooks:secrets.ciphertext:<entryId>`.
- **`encryptRingSecret(plaintext, entryId)`** / **`decryptRingSecret(stored, entryId)`** – Thin wrappers around `encryptVersionedSecret` / `decryptVersionedSecret` that inject the key ring from config and the binding.
- **`mintRingSecret()`** – Generates a `whsec_`-prefixed 256-bit base64 secret, encrypts it, and returns the new `WebhookSecretRingEntry` alongside the plaintext (caller must surface it exactly once).
- **`liveRingEntries(ring, now)`** – Filters a ring (oldest-first) to entries still in force: the newest never expires; an older entry is live only while its successor's age is within the overlap window.
- **`retiringRingSecrets(ring, now)`** – Returns the superseded live entries with their computed `retiresAt` timestamp (successor `createdAt` + overlap).
- **`activeRingSecrets(ring, now)`** – Decrypts all live entries, preserving oldest-first order (matching the `webhook-signature` header convention where the newest signature is listed last).
- **`removeRingSecret(ring, id)`** – Drops a single entry by id (the "drop" half of rotation).

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** – Provides `encryptVersionedSecret`, `decryptVersionedSecret`, and the `SecretBinding` type that this file wraps.
- **`src/modules/webhooks/config.ts`** – Supplies `getWebhookEncryptionKeyRing()` (the versioned AES-256-GCM key ring) and `getWebhookSecretOverlapMs()` (the rotation overlap window from `NODE_WEBHOOK_SECRET_OVERLAP_HOURS`).
- **`src/modules/webhooks/model.ts`** – Defines `WebhookSecretRingEntry`, the shape stored in a subscription document's `secrets` array.
- **`src/modules/webhooks/services/attempt.ts`** – Calls `activeRingSecrets` to obtain plaintext secrets for signing a delivery.
- **`src/modules/webhooks/services/reencrypt.ts`** – Re-encrypts stored ciphertexts under a new key ring using the same `ringSecretBinding`.
- **`src/modules/webhooks/services/actions.ts` / `subscriptions.ts`** – Orchestrate mint, rotate (add + schedule drop), and drop via the exported ring operations.
- **Test files** (`secrets.test.ts`, `delivery.test.ts`, `reencrypt.test.ts`, `fan-out.test.ts`, `sweep.test.ts`, etc.) – Unit- and integration-test each exported function.

## Notes

- The plaintext format is `whsec_` + base64(32 random bytes), matching the Standard Webhooks spec so any compatible consumer library can verify signatures.
- The AAD binds the ciphertext to a specific ring-entry `id` (not the subscription `_id`, which may not exist yet at first mint). This means you must pass the same `entryId` to `decryptRingSecret` that was used at encryption time.
- Ring order is invariant: always oldest-first. `activeRingSecrets` preserves this order because the `webhook-signature` header lists signatures oldest→newest, and consumers are expected to switch to the last one.
- `liveRingEntries` uses the *successor's* `createdAt` to decide expiry, not the entry's own age. A ring with only one entry is always fully live.
- The overlap window is configured via `NODE_WEBHOOK_SECRET_OVERLAP_HOURS`; it bounds how long a leaked, superseded secret remains valid for signing.
