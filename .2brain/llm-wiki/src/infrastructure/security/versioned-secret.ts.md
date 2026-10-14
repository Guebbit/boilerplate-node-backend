---
source: src/infrastructure/security/versioned-secret.ts
sha256: ad0d3cce3bc9a0410c89f5e0cd458a228d28e9aa6c4c224fa335bb459d703e5e
generated_at: 2026-10-14T08:18:15.278106+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/versioned-secret.ts

## Purpose

Provides versioned AES-256-GCM encryption for secrets at rest (TOTP credentials, webhook signing secrets, PII). The "versioned" part means each ciphertext is stamped with the key version that wrote it, so a key-rotation ring can decrypt any row against the correct key while always encrypting new rows with the newest key — no one-off migration needed.

## Key elements

- **`VersionedKey`** — interface pairing a `version` string (stamped on ciphertext) with the raw operator-supplied `key`.
- **`SecretPurpose`** — union `'pii' | 'totp' | 'webhook-secret'`; used as the HKDF `info` label to domain-separate key derivations between rings even if an operator reuses the same secret string.
- **`SecretBinding`** — `{ purpose, aad }`. The `aad` (e.g. `users:phone:<_id>`) is GCM associated data: authenticated but never stored, so a ciphertext copied to another row/field fails its auth tag.
- **`parseVersionedKeyRing(raw)`** — parses the env-var wire format (`v2:secret2,v1:secret1`, newest first) into `VersionedKey[]`. A bare value with no `:` is treated as `v1` for backward compatibility.
- **`encryptVersionedSecret(plaintext, ring, binding)`** — encrypts under `ring[0]` (newest key). Output format: `<version>:<iv-hex>:<auth-tag-hex>:<ciphertext-hex>`.
- **`versionOf(stored)`** — extracts the key-version prefix from a stored ciphertext; used by rotation jobs to count rows per version.
- **`decryptVersionedSecret(stored, ring, binding, label)`** — looks up the ring entry matching the ciphertext's stamped version, then decrypts. Enforces the full 16-byte auth tag length (rejects Node's default of accepting ≥ 4-byte tags).
- **`rewrapVersionedSecret(stored, ring, binding, label)`** — moves a ciphertext onto `ring[0]`. Idempotent: if the stored version already equals `ring[0].version` it returns the input unchanged (byte-for-byte), so a re-encryption job can safely re-process the same row.
- **`deriveKey`** (internal) — stretches the operator's arbitrary-length secret to 32 bytes via `deriveSubkey` (HKDF-SHA256) with `purpose` as the info parameter.

## Relationships

- **`./subkey.ts`** — imported; `deriveSubkey` performs the HKDF key-stretching that turns an operator string into a 32-byte AES key.
- **`src/modules/account/two-factor/totp.ts`** — consumer; calls the encrypt/decrypt functions with `SecretPurpose: 'totp'` and the `NODE_TOTP_ENCRYPTION_KEY` ring.
- **`src/modules/webhooks/secrets.ts`** — consumer; same API with `SecretPurpose: 'webhook-secret'` and the `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` ring.
- **`src/infrastructure/security/pii-encryption.ts`** — sibling consumer; uses `SecretPurpose: 'pii'` for the same encryption format against a separate key ring.
- **`src/modules/account/session/config.ts`** — pattern reference; its `parseKeyRing` (for JWT secrets) established the newest-first ring shape that this module's `parseVersionedKeyRing` mirrors.
- **`src/infrastructure/security/reencrypt.ts` / `src/modules/users/services/reencrypt.ts`** — call `rewrapVersionedSecret` in batch to migrate rows to the newest key after a rotation.
- **`tests/unit/infrastructure/security/versioned-secret.test.ts`** — unit tests for parsing, encrypt/decrypt round-trips, version-mismatch errors, and rewrap idempotency.
- **`src/infrastructure/config/fields.ts`** — declares the env-var fields (`NODE_TOTP_ENCRYPTION_KEY`, `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`) whose values are fed into `parseVersionedKeyRing`.

## Notes

- The `:` and `,` delimiters are safe because operators are expected to generate keys with `randomBytes(...).toString('base64')` or `'hex'`, neither of which contains those characters. If an operator manually crafts a key containing `:` or `,`, parsing will silently mis-split.
- `authTagLength: AUTH_TAG_BYTES` (16) is explicitly set on the decipher. Without it, Node accepts tags as short as 4 bytes, which is trivially forgeable — this is a deliberate hardening over Node's default.
- `rewrapVersionedSecret` returns the *same string* (not a re-encrypted copy) when the version is already current. This is intentional for idempotency in bulk migration jobs; a fresh IV would make a no-op indistinguishable from a write.
- The `label` parameter on decrypt/rewrap is purely for error-message clarity (e.g. `"Unknown TOTP key version: v9"`); it has no cryptographic role.
- AAD must be identical at encrypt and decrypt time. The convention (visible in the docblock example) is `<resource>:<field>:<entity-id>`.
