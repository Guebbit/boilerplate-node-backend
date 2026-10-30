---
source: src/infrastructure/security/versioned-secret.ts
sha256: 4398f3fb6a56f2e9b5b1335c963cfbd9da9a9785c88e99d36cea0fa4867f7345
generated_at: 2026-10-29T02:16:45.452982+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/versioned-secret.ts

## Purpose

Provides AES-256-GCM at-rest encryption for secrets with built-in key-rotation support. A "ring" of versioned keys lets the system always encrypt with the newest key while decrypting any row against whichever key stamped it, eliminating the need for a migration that must determine which key a row used. The same crypto is shared across PII, TOTP, and webhook-secret storage; the only difference is the HKDF domain-separation label and the configured key material.

## Key elements

- **`VersionedKey`** — `{ version: string; key: string }`; one operator-configured key tagged with the version it stamps on ciphertext.
- **`parseVersionedKeyRing(raw)`** — Parses the `version:key,version:key,…` wire format (newest first). A bare value with no `:` defaults to `v1`. Returns `VersionedKey[]`.
- **`SecretPurpose`** — Union `'pii' | 'totp' | 'webhook-secret'`; used as the HKDF `info` label to domain-separate key derivation across rings.
- **`SecretBinding`** — `{ purpose, aad }`; the AAD string (e.g. `users:phone:<id>`) binds a ciphertext to a specific row/field and is authenticated but not stored.
- **`encryptVersionedSecret(plaintext, ring, binding)`** — Encrypts under `ring[0]`. Returns `<version>:<iv-hex>:<auth-tag-hex>:<ciphertext-hex>`.
- **`keyVersionOf(stored)`** — Extracts the leading version token from a stored ciphertext.
- **`decryptVersionedSecret(stored, ring, binding, label)`** — Looks up the ring entry matching the ciphertext's stamped version, then decrypts. Enforces the full 128-bit auth tag (`authTagLength: 16`).
- **`rewrapVersionedSecret(stored, ring, binding, label)`** — Decrypt-then-encrypt to move a value onto `ring[0]`. Short-circuits (returns the input unchanged) when already on the newest version, making batch re-encryption idempotent.

## Relationships

- **`src/infrastructure/security/subkey.ts`** — Imports `deriveSubkey`; the operator-chosen key string is stretched via HKDF-SHA256 before being fed to AES-256-GCM.
- **`src/modules/account/two-factor/totp.ts`** — Consumes this module with `purpose: 'totp'` and the `NODE_TOTP_ENCRYPTION_KEY` ring.
- **`src/modules/webhooks/secrets.ts`** — Consumes this module with `purpose: 'webhook-secret'` and the `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` ring.
- **`src/infrastructure/security/pii-encryption.ts`** — Sibling consumer using `purpose: 'pii'` for PII fields.
- **`src/infrastructure/security/reencrypt.ts`** — Batch job that calls `rewrapVersionedSecret` across tables during a key rotation.
- **`src/modules/users/services/reencrypt.ts`** — Service-layer orchestration that drives per-record re-encryption.
- **`src/modules/account/session/config.ts`** — Its `parseKeyRing` (for JWT secrets) established the newest-first ring shape that this module mirrors.
- **`src/infrastructure/config/fields.ts`** — Declares the `NODE_TOTP_ENCRYPTION_KEY` / `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY` environment variables consumed by `parseVersionedKeyRing`.

## Notes

- The `:` delimiter in the ring wire format is safe because the expected key material (`base64` or `hex` of `randomBytes`) contains neither `:` nor `,`.
- `decryptVersionedSecret` explicitly sets `authTagLength: 16`. Without this, Node's `createDecipheriv` accepts tags as short as 4 bytes, which is trivially forgeable.
- AAD is **authenticated but not persisted**; a ciphertext copied to a different row or field will fail its auth tag rather than silently decrypt.
- `rewrapVersionedSecret` returns the input **byte-for-byte unchanged** when the version already matches `ring[0]`. A fresh IV would otherwise make a no-op re-encryption look like a write, breaking idempotency.
- The module is side-effect-free and has no I/O; all key material arrives via the parsed ring. Rotation is an operator action (see `docs/tools/security.md`).
