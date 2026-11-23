---
source: src/infrastructure/security/pii-encryption.ts
source_sha256: 329246172fde1cdfa849c41c45be392db145225bdef8f95503683d6fb5ae0342
context_sha256: b26b5d959732f651f4c7161b2c8e356cffd2d1778c236be3442e4a38830395fe
generated_at: 2026-11-22T03:09:06.900325+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/security/pii-encryption.ts

## Purpose
Field-level encryption for GDPR-flagged PII stored outside the account's own secrets, such as an address-book entry's fullName/street/city/zip/country/phone and a user's own phone. It uses the same AES-256-GCM primitive as the TOTP secret (via `versioned-secret.ts`), but under a different key (`NODE_PII_ENCRYPTION_KEY`). Rotating the PII key therefore never affects the TOTP key, and the reverse. The rotation procedure is shared with the TOTP and webhook key rings.

## Key elements
- `getPiiEncryptionKeyRing()`: returns the `VersionedKey[]` ring from `piiConfig().NODE_PII_ENCRYPTION_KEY`.
- `piiBinding(aad)`: builds the `SecretBinding` `{ purpose: 'pii', aad }` that a PII field is written under. Re-encryption jobs use it to rewrap a field.
- `encryptPii(plaintext, aad)`: encrypts one PII field for storage with `encryptVersionedSecret`, using the current key ring and the `'pii'` binding.
- `decryptPii(stored, aad, label)`: decrypts one stored field with `decryptVersionedSecret`. `label` names the field in a version-mismatch error (e.g. `'address fullName'`).

## Relationships
- **`versioned-secret.ts`**: provides `encryptVersionedSecret`, `decryptVersionedSecret`, and the `SecretBinding` and `VersionedKey` types. This file is a thin PII-specific wrapper over them.
- **`config.ts`**: supplies `piiConfig()`, the source of the key ring.
- **Neighbors outside `security/`** (`addresses`, `delivery`, `invoicing`, `orders` and `users` modules): this file is a dependency of theirs, so they appear to call these helpers to encrypt, decrypt and rewrap PII fields. The file itself shows only the exported API, so which neighbor uses which function is not visible here.
  - The `pii.ts` files and the `presenter.ts`, `timeline.ts` and `update.ts` files are likely the encrypt and decrypt call sites.
  - The `reencrypt.ts` files are likely the rotation jobs that use `getPiiEncryptionKeyRing` and `piiBinding`.

## Notes
- The `aad` ties a ciphertext to its location, e.g. `users:phone:<user _id>`. Decryption needs the same `aad`, so a value moved to another row or field fails to decrypt.
- The binding purpose is always `'pii'`. `piiBinding` and the two crypto functions each construct it separately.
- The key ring is read from config on every call. Nothing is cached in this file.
- The key ring's wire format is documented under `parseVersionedKeyRing`.
