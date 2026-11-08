---
source: src/infrastructure/security/versioned-secret.ts
sha256: 4398f3fb6a56f2e9b5b1335c963cfbd9da9a9785c88e99d36cea0fa4867f7345
generated_at: 2026-11-08T03:50:18.618965+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/versioned-secret.ts

## Purpose

Provides versioned AES-256-GCM encryption for secrets stored at rest, so a key rotation can decrypt old rows under their original key while encrypting new ones with the newest key. Shared across the PII, TOTP, and webhook-secret rings — same crypto, different HKDF-derived keys — so the logic is written once and parameterized by a `SecretBinding`.

## Key elements

- **`VersionedKey`** — `{ version: string; key: string }`, one operator-configured key tagged with the version it stamps on ciphertext.
- **`parseVersionedKeyRing(raw)`** — splits a comma-separated `version:key,…` env string into `VersionedKey[]` (newest first). A bare value with no `:` defaults to version `v1` for backward compatibility.
- **`SecretPurpose`** — `'pii' | 'totp' | 'webhook-secret'`; used as the HKDF `info` label for domain separation between rings.
- **`SecretBinding`** — `{ purpose, aad }`; the HKDF label plus GCM associated data that ties a ciphertext to a specific row/field.
- **`encryptVersionedSecret(plaintext, ring, binding)`** — encrypts under `ring[0]` (newest key). Returns `version:iv-hex:auth-tag-hex:ciphertext-hex`.
- **`keyVersionOf(stored)`** — extracts the version token from the front of a stored ciphertext string.
- **`decryptVersionedSecret(stored, ring, binding, label)`** — looks up the key by the ciphertext's own stamped version (position-independent), enforces the full 128-bit auth tag, and verifies AAD. Throws on unknown version, malformed format, or tag mismatch.
- **`rewrapVersionedSecret(stored, ring, binding, label)`** — idempotent re-encryption: returns the value unchanged if already on `ring[0]`, otherwise decrypt-and-re-encrypt under the newest key.

## Relationships

- **`./subkey.ts`** — imports `deriveSubkey` to stretch the operator's arbitrary-length key into a 32-byte AES-256 key via HKDF-SHA256, using `binding.purpose` as the domain label.
- **`src/modules/account/two-factor/totp.ts`** — consumer; calls `encryptVersionedSecret` / `decryptVersionedSecret` with `purpose: 'totp'` and `NODE_TOTP_ENCRYPTION_KEY`.
- **`src/modules/webhooks/secrets.ts`** — consumer; same pattern with `purpose: 'webhook-secret'` and `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`.
- **`src/infrastructure/security/pii-encryption.ts`** — consumer; uses the same module with `purpose: 'pii'` for PII fields (phone, etc.).
- **`src/infrastructure/security/reencrypt.ts`** — orchestration layer that calls `rewrapVersionedSecret` across rows during a rotation job.
- **`src/modules/users/services/reencrypt.ts`** — per-module reencrypt service that delegates to the shared rewrap.
- **`src/modules/account/session/config.ts`** — the "ring" shape (newest-first, position-based encrypt, version-lookup decrypt) mirrors the `parseKeyRing` pattern established there for JWT secrets.
- **`src/infrastructure/config/fields.ts`** — declares the env-var fields (`NODE_TOTP_ENCRYPTION_KEY`, `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`) whose raw values are fed to `parseVersionedKeyRing`.
- **Integration tests** (`src/modules/{account,addresses,delivery,invoicing,orders,users}/tests/integration/reencrypt.test.ts`) — exercise the decrypt/rewrap path against a multi-version ring to verify rotation correctness end-to-end.

## Notes

- **Auth tag length is locked to 16 bytes.** `createDecipheriv` is called with `{ authTagLength: 16 }` explicitly; without it Node would accept a 4-byte truncated tag that is far easier to forge.
- **Idempotency of rewrap.** `rewrapVersionedSecret` short-circuits when the stored version already equals `ring[0].version`, returning the input byte-for-byte (no fresh IV), so a re-encryption job is safe to re-run.
- **AAD is not stored.** The binding string (e.g. `users:phone:<id>`) must be re-supplied at decrypt time; a ciphertext copied to a different row or field will fail its GCM auth tag.
- **Delimiter safety.** The `version:key` split uses `:`; the two expected key encodings (base64, hex) contain neither `:` nor `,`, so the parse is unambiguous.
- **Rotation is a ring, not a migration.** Old keys remain in the env string until every row has been rewrapped; the operator-facing runbook lives in `docs/tools/security.md`.
