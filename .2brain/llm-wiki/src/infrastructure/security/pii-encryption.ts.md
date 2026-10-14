---
source: src/infrastructure/security/pii-encryption.ts
sha256: 8ac6bea9dd9266dfc3a6103b509995673c4dc6ca95079499635f44f80b4673f7
generated_at: 2026-10-14T08:16:50.705916+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/pii-encryption.ts

## Purpose

Provides field-level AES-256-GCM encryption for GDPR-flagged PII values (address-book fields, user phone) that are stored outside the account's own secrets. It wraps the shared `versioned-secret.ts` primitives under a dedicated key (`NODE_PII_ENCRYPTION_KEY`), keeping PII rotation independent from TOTP/webhook key rotation.

## Key elements

- **`getPiiEncryptionKeyRing()`** — Returns the versioned key ring parsed from `NODE_PII_ENCRYPTION_KEY` (delegated to `piiConfig()`).
- **`piiBinding(aad: string)`** — Produces the `SecretBinding` (`{ purpose: 'pii', aad }`) that identifies where a field lives; re-encryption jobs need this to rewrap a value.
- **`encryptPii(plaintext, aad)`** — Encrypts one PII field for storage. `aad` (e.g. `users:phone:<user_id>`) is bound into the ciphertext via AAD.
- **`decryptPii(stored, aad, label)`** — Decrypts a stored PII field. `aad` must match the value used at encryption time; `label` names the field in version-mismatch errors.

## Relationships

- **`./versioned-secret`** — Supplies the underlying `encryptVersionedSecret` / `decryptVersionedSecret` primitives and the `SecretBinding` / `VersionedKey` types.
- **`./config`** — Source of `piiConfig()`, which parses and validates `NODE_PII_ENCRYPTION_KEY` at startup.
- **Module PII files** (`addresses/pii.ts`, `invoicing/pii.ts`, `orders/pii.ts`) — Call `encryptPii` / `decryptPii` with module-specific `aad` strings to protect their respective fields.
- **Reencrypt services** (`addresses/reencrypt.ts`, `invoicing/services/reencrypt.ts`, `orders/services/reencrypt.ts`, `users/services/reencrypt.ts`) — Use `piiBinding` to construct the binding needed for key-rotation rewrap jobs.
- **`users/presenter.ts`** / **`users/services/update.ts`** — Consume `decryptPii` (and possibly `encryptPii`) for the user's own phone field.

## Notes

- The `aad` string is part of the cryptographic binding: a value is undecryptable if moved to a different row or field without re-encryption. Callers must use a stable, location-identifying AAD (e.g. `users:phone:<user_id>`).
- The `purpose` tag is always the literal `'pii'`; this is what distinguishes PII ciphertext from TOTP or webhook secrets in the shared versioned-secret format.
- `NODE_PII_ENCRYPTION_KEY` supports a versioned key ring (multiple keys) so that rotation can decrypt old values under the old key and re-encrypt under the new one—see `docs/tools/security.md` for the procedure.
