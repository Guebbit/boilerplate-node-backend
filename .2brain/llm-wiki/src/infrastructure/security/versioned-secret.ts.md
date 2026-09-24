---
source: src/infrastructure/security/versioned-secret.ts
sha256: 9626d536b9f1e3593b47f5aa489b9d6f554ca49d6b3d9c9deb6ea3aefe963858
generated_at: 2026-09-23T17:53:14.232459+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/versioned-secret.ts

## Purpose

Provides versioned AES-256-GCM encryption/decryption for secrets at rest, so a key rotation can decrypt rows written under an old key while encrypting new ones under the current key—without a data migration. Written once and shared by the TOTP and webhook-secret modules, which use the same format with different operator-supplied keys.

## Key elements

- **`VersionedKey`** — `{ version: string; key: string }`, the shape of each ring entry.
- **`parseVersionedKeyRing(raw)`** — Parses a comma-separated env-var string (`v2:abc,v1:def`) into a `VersionedKey[]`. A bare value (no colon) defaults to version `v1` for backward compatibility with single-key deployments.
- **`deriveKey(secret)`** *(module-private)* — Stretches an arbitrary-length operator string into a 32-byte AES key via HKDF-SHA256 (`node:crypto`), avoiding a bare single-pass hash.
- **`encryptVersionedSecret(plaintext, ring)`** — Encrypts with `ring[0]` (newest key). Output format: `<version>:<iv-hex>:<auth-tag-hex>:<ciphertext-hex>`.
- **`decryptVersionedSecret(stored, ring, label)`** — Splits the stored string, finds the matching `VersionedKey` by stamped version, and decrypts. Throws on unknown version, malformed format, or auth-tag mismatch.

## Relationships

- **`src/modules/account/two-factor/totp.ts`** — Primary consumer; calls `encryptVersionedSecret` / `decryptVersionedSecret` with the `NODE_TOTP_ENCRYPTION_KEY` ring.
- **`src/modules/webhooks/secrets.ts`** — Second consumer; same API, fed by `NODE_WEBHOOK_SECRET_ENCRYPTION_KEY`.
- **`src/modules/webhooks/config.ts`** — Reads/normalises the webhook encryption-key env var before `secrets.ts` parses it into a ring.
- **`src/modules/account/session/config.ts`** — Not a direct import, but the "ring, newest-first, lookup-by-stamped-version" pattern here mirrors that file's `parseKeyRing` for JWT signing keys; the two are intentionally the same shape.
- **`tests/unit/infrastructure/security/versioned-secret.test.ts`** — Unit tests covering parse, encrypt/decrypt round-trip, rotation, and error paths.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — Exercises the encrypt/decrypt path indirectly through the TOTP module.

## Notes

- The wire delimiter `:` is safe because operators generate keys as base64 or hex (`randomBytes`), neither of which contains `:` or `,`.
- `deriveKey` uses a fixed HKDF info string (`"versioned-secret"`) and empty salt; changing either silently breaks all existing ciphertexts.
- Decrypt does **not** depend on ring order—lookup is by the version string stamped in the ciphertext. Ring order only matters for `encryptVersionedSecret` (always `ring[0]`).
- The `label` parameter in `decryptVersionedSecret` exists purely for error-message clarity (e.g. `"Unknown TOTP key version: v9"`); it has no effect on the crypto.
- Rotation runbook: `docs/tools/security.md` → "Database credential and key rotation".
