---
source: src/modules/webhooks/secrets.ts
sha256: 443eb4d712c09e63523da06f3f110f36dfc0a49c499a1f9fb637282ea8b1cd73
generated_at: 2026-09-23T19:41:42.779991+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/secrets.ts

## Purpose

Implements the webhook secret-ring lifecycle (mint, rotate, drop) on top of versioned AES-256-GCM encryption. It is the single place where plaintext webhook signing secrets are created, encrypted for persistence, and decrypted for use during a delivery attempt. The plaintext is never stored in `WebhookSubscriptionDocument.secrets`; it exists in memory only long enough to be returned in an HTTP response or to sign an outgoing webhook.

## Key elements

- **`encryptRingSecret(plaintext)`** — encrypts a secret for storage using the webhook key ring; delegates to `encryptVersionedSecret`.
- **`decryptRingSecret(stored)`** — decrypts a stored secret; throws on malformed format, wrong key, or auth-tag mismatch (tampering / unknown key version).
- **`mintRingSecret()`** — generates a new `whsec_`-prefixed secret (32 random bytes, base64), encrypts it, and returns `{ entry: WebhookSecretRingEntry, plaintext }`. The plaintext is handed back exactly once.
- **`activeRingSecrets(ring)`** — decrypts every entry in a ring, preserving ring order (oldest first). This is the array a delivery attempt signs with.
- **`removeRingSecret(ring, id)`** — filters one entry out by id; used as the second step of a rotation after consumers have switched.
- **`generatePlaintextSecret()`** (internal) — produces the `whsec_` + base64(32 random bytes) string, matching the Standard-Webhooks format that `webhook-signing.ts`'s `decodeSecret` expects.

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** — provides `encryptVersionedSecret` / `decryptVersionedSecret`, the actual AES-256-GCM primitives and wire format.
- **`src/modules/webhooks/config.ts`** — supplies `getWebhookEncryptionKeyRing`, the versioned key ring backed by `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` (a required config value).
- **`src/modules/webhooks/model.ts`** — defines the `WebhookSecretRingEntry` type (id, ciphertext, createdAt) that this module reads and writes.
- **`src/modules/webhooks/services/attempt.ts`** — calls `activeRingSecrets` to obtain the plaintext keys needed to sign each delivery attempt.
- **`src/modules/webhooks/services/subscriptions.ts`** — calls `mintRingSecret` and `removeRingSecret` to perform add/rotate/drop of ring entries during subscription management.
- **`src/modules/webhooks/tests/unit/secrets.test.ts`** — unit tests covering the encrypt/decrypt round-trip, mint format, and ring-manipulation helpers.
- **`src/modules/webhooks/tests/integration/delivery.test.ts`** — integration test that exercises the full path from stored ciphertext through `activeRingSecrets` into a signed delivery.

## Notes

- The key ring is **shared** with `account/two-factor/totp.ts`'s TOTP secret encryption; rotating `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` affects both.
- `mintRingSecret` returns the plaintext **once** in the HTTP response (per `openapi.yaml`'s `secret` / `newSecret` field); after that the caller is responsible for storing only the ciphertext entry.
- Ring order is meaningful: `activeRingSecrets` preserves oldest-first, which maps to the `webhook-signature` header convention where the newest-minted signature appears last.
- `decryptRingSecret`'s third argument (`'webhook secret'`) is a context label used in error messages, not a functional parameter.
