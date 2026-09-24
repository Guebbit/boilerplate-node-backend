---
source: src/infrastructure/security/pii-encryption.ts
sha256: 2d13bab93fe5a4a50a86201e29e9add18948d31ae388edab34ed3722e74b7dba
generated_at: 2026-09-23T17:52:59.566607+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/pii-encryption.ts

## Purpose

Provides field-level encryption/decryption for the GDPR-flagged PII this codebase stores outside an account's own secrets — address-book entry fields (fullName, street, city, zip, country, phone) and a user's own phone number. It wraps the AES-256-GCM primitives in `versioned-secret.ts` under a dedicated key (`NODE_PII_ENCRYPTION_KEY`) so PII key rotation is independent of the TOTP key ring.

## Key elements

- **`encryptPii(plaintext: string): string`** — Encrypts a single PII field for storage. Returns the versioned-secret wire format (key-version prefix + ciphertext).
- **`decryptPii(stored: string, label: string): string`** — Decrypts a stored PII field. The `label` parameter is used only in version-mismatch error messages (e.g. `'address fullName'`).
- **`getPiiEncryptionKeyRing()`** (internal) — Reads `NODE_PII_ENCRYPTION_KEY` from the environment and parses it into a `VersionedKey[]` via `parseVersionedKeyRing`. Called fresh on every encrypt/decrypt, so env changes take effect immediately.

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** — Direct dependency. Supplies `encryptVersionedSecret`, `decryptVersionedSecret`, `parseVersionedKeyRing`, and the `VersionedKey` type. This file adds no crypto logic; it only selects the correct key ring and passes a human-readable label.
- **`src/modules/addresses/pii.ts`**, **`src/modules/addresses/repository.ts`** — Consumers that encrypt/decrypt the address-book PII fields described in the module docstring.
- **`src/modules/users/model.ts`**, **`src/modules/users/service.ts`** — Consumers that encrypt/decrypt a user's own phone number.

## Notes

- The key ring is re-read from `process.env` on **every** call. There is no caching, so changing the env var mid-process affects subsequent operations immediately.
- `decryptPii`'s `label` parameter is cosmetic (error-message only) — forgetting a descriptive label won't break decryption but will make version-mismatch errors harder to debug.
- PII key rotation is **independent** of the TOTP key ring; rotating `NODE_PII_ENCRYPTION_KEY` does not affect TOTP secrets and vice-versa. The shared rotation procedure lives in `docs/tools/security.md`.
- This is a `@module` (no named re-exports beyond the two functions); import `encryptPii` / `decryptPii` directly.
