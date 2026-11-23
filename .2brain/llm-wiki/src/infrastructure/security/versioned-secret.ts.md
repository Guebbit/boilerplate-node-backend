---
source: src/infrastructure/security/versioned-secret.ts
source_sha256: 04340d84f4fd5e3e8f5e88a2aa227f88938689f5420f0352d89566e7dc537ef1
context_sha256: b5566d8c6a14b66d463f84e3d0db79e22b4757e84f8e76f3c25830e5f110516a
generated_at: 2026-11-22T03:09:59.930658+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/security/versioned-secret.ts

## Purpose
Shared AES-256-GCM encryption for secrets stored at rest, with a key version stamped on each ciphertext so keys can be rotated. Old rows decrypt against the key that wrote them, while new writes use the newest key. TOTP and webhook-secret encryption both use it, so the crypto lives in one place.

## Key elements
- `VersionedKey` — `{ version, key }`: an operator-configured secret and the label stamped on ciphertext it produces.
- `parseVersionedKeyRing(raw)` — parses `version:key,version:key` (newest first) into a `VersionedKey[]`. An entry with no `:` becomes version `v1`, so single-key deployments need no env change. Empty entries are dropped, and undefined input gives an empty ring.
- `SecretPurpose` — `'pii' | 'totp' | 'webhook-secret'`. It is the HKDF `info` label, so each ring derives unrelated keys even if the same secret is reused.
- `SecretBinding` — `{ purpose, aad }`. `aad` is the GCM associated data (e.g. `users:phone:<id>`), so a ciphertext copied to another row or field fails authentication.
- `encryptVersionedSecret(plaintext, ring, binding)` — always encrypts with `ring[0]`. It uses a random 12-byte IV and a key derived via `deriveSubkey`. Output format: `<version>:<iv-hex>:<tag-hex>:<ciphertext-hex>`.
- `keyVersionOf(stored)` — returns the version prefix, which a rotation job can count by.
- `decryptVersionedSecret(stored, ring, binding, label)` — finds the ring entry by the stamped version (ring order is irrelevant) and decrypts with a strict 16-byte auth tag length. `label` only names the secret in the "Unknown … key version" error.
- `rewrapVersionedSecret(stored, ring, binding, label)` — moves a value onto `ring[0]`. A value already on the newest key is returned unchanged, so re-encryption jobs are idempotent. Otherwise it decrypts and re-encrypts.

## Relationships
- `src/infrastructure/security/subkey.ts` (`deriveSubkey`) — turns the configured string into a 32-byte AES key with HKDF-SHA256, using `purpose` as the label.
- `src/modules/account/two-factor/totp.ts` and `src/modules/webhooks/secrets.ts` — consumers, using `NODE_TOTP_ENCRYPTION_KEY` and `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` respectively.
- `src/modules/account/session/config.ts` — its `parseKeyRing` for JWT secrets is the model for this ring shape (newest first).
- `src/infrastructure/security/pii-encryption.ts`, `src/infrastructure/security/reencrypt.ts`, `src/modules/users/services/reencrypt.ts` and the per-module `reencrypt` integration tests — related through the dependency graph. The `'pii'` purpose and `rewrapVersionedSecret` exist for this kind of rotation and re-encryption work.
- `src/infrastructure/config/fields.ts` and `src/modules/webhooks/config.ts` — config-side neighbors. This file does not import them.

## Notes
- Decryption throws on a malformed format, an unknown version, or an auth-tag mismatch. A key version dropped from the ring therefore surfaces as an error, and `rewrapVersionedSecret` propagates it so a corrupt row stops the job.
- The binding (`purpose` and `aad`) must be identical at encrypt and decrypt time. The AAD is authenticated but not stored.
- Decryption does not validate the stored format beyond splitting on `:`. Malformed input fails with an error from the lookup or from Node crypto.
- `:` and `,` are safe as delimiters because base64 and hex output contain neither.
