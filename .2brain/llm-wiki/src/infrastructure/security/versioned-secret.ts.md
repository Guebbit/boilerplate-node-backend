---
source: src/infrastructure/security/versioned-secret.ts
sha256: 7c5862f62b6587f19417a4d59056262e56b6c5550e7c370bc45e7aae2e404a7a
generated_at: 2026-09-27T14:16:44.223605+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/versioned-secret.ts

## Purpose

Provides AES-256-GCM encryption/decryption of secrets at rest with a **key-version ring** so that key rotation can decrypt old rows against the key they were written under while encrypting new ones with the newest key. Written once and shared by two consumers (`totp.ts` and `webhooks/secrets.ts`) that use the same format but different operator-supplied keys.

## Key elements

- **`VersionedKey`** (interface) — `{ version: string; key: string }`, one operator-configured entry in the ring.
- **`parseVersionedKeyRing(raw: string | undefined): VersionedKey[]`** — Splits a comma-separated `version:key` env value into a ring, newest first. A bare value with no `:` defaults to version `v1` for backward compatibility.
- **`deriveKey(secret: string): Buffer`** (module-private) — Stretches the operator's string to a 32-byte AES key via HKDF-SHA256.
- **`encryptVersionedSecret(plaintext, ring): string`** — Encrypts under `ring[0]` (newest). Returns `version:iv-hex:auth-tag-hex:ciphertext-hex`.
- **`decryptVersionedSecret(stored, ring, label): string`** — Splits the stored string, looks up the stamped version in the ring (order-independent), and decrypts with the full 16-byte auth tag. Throws on unknown version, malformed input, or auth-tag mismatch.
- **`AUTH_TAG_BYTES`** (module-private constant) — `16`; enforces the full GCM tag length on decrypt.

## Relationships

- **`src/modules/account/two-factor/totp.ts`** — Primary consumer. Reads `NODE_TOTP_ENCRYPTION_KEY`, passes the parsed ring to `encryptVersionedSecret`/`decryptVersionedSecret` with label `'TOTP'`.
- **`src/modules/webhooks/secrets.ts`** — Second consumer. Reads `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` and calls the same two functions with label `'webhook secret'`.
- **`src/modules/account/session/config.ts`** — Structural parallel only: its `parseKeyRing` for JWT secrets uses the same "newest-first, version-stamped" shape. No import or call between the two files.

## Notes

- **Delimiter safety**: `:` and `,` are safe as separators because operators are expected to generate keys as base64 or hex, neither of which contains those characters.
- **Auth-tag enforcement**: `decryptVersionedSecret` passes `{ authTagLength: 16 }` to `createDecipheriv`. Without this, Node accepts tags as short as 4 bytes, which are trivially forgeable.
- **No new dependencies**: All crypto comes from `node:crypto` (`createCipheriv`, `createDecipheriv`, `hkdfSync`, `randomBytes`).
- **IV is 96 bits** (`randomBytes(12)`), the NIST-recommended length for GCM.
- **Encryption always targets `ring[0]`**; the ring must be sorted newest-first by the caller. Decryption is order-independent (lookup by version string).
