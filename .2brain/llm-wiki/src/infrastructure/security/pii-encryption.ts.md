---
source: src/infrastructure/security/pii-encryption.ts
sha256: 8ac6bea9dd9266dfc3a6103b509995673c4dc6ca95079499635f44f80b4673f7
generated_at: 2026-11-08T03:49:19.757969+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/pii-encryption.ts

## Purpose

Field-level AES-256-GCM encryption for GDPR-flagged PII that lives outside an account's own secrets (address-book fields, user phone). It wraps the same `versioned-secret` primitive used by TOTP but under a separate key (`NODE_PII_ENCRYPTION_KEY`) so key rotation for one never affects the other.

## Key elements

- **`getPiiEncryptionKeyRing()`** — Returns the `VersionedKey[]` ring parsed from `NODE_PII_ENCRYPTION_KEY` (sourced via `piiConfig()`).
- **`piiBinding(aad)`** — Builds the `SecretBinding` (`{ purpose: 'pii', aad }`) a field is stored under; re-encryption jobs call this to rewrap a value.
- **`encryptPii(plaintext, aad)`** — Encrypts one PII field. `aad` encodes the field's location (e.g. `users:phone:<id>`) and must match at decrypt time.
- **`decryptPii(stored, aad, label)`** — Decrypts a stored field. `label` is a human-readable name (e.g. `'address fullName'`) used only in version-mismatch error messages.

## Relationships

- **`./config.ts`** — Imports `piiConfig` to obtain the `NODE_PII_ENCRYPTION_KEY` ring.
- **`./versioned-secret.ts`** — Imports `encryptVersionedSecret`, `decryptVersionedSecret`, and the `SecretBinding` / `VersionedKey` types; this file is a thin PII-specific wrapper over those primitives.
- **`modules/*/pii.ts`** (addresses, delivery, invoicing, orders) — Domain PII helpers that call `encryptPii` / `decryptPii` to store and read their respective fields.
- **`modules/*/services/reencrypt.ts`** (addresses, delivery, invoicing, orders, users) — Re-encryption jobs that call `piiBinding` to rewrap fields under a new key version.
- **`modules/orders/presenter.ts`**, **`modules/users/presenter.ts`** — Presenters that call `decryptPii` to surface PII in API responses.
- **`modules/orders/services/timeline.ts`** — Decrypts order PII for timeline display.
- **`modules/users/services/update.ts`** — Re-encrypts the user phone field when it changes.

## Notes

- The `aad` string is cryptographically bound to the ciphertext; passing a different `aad` at decrypt time will fail. Every caller must construct the AAD deterministically (e.g. `users:phone:<id>`, `addresses:fullName:<id>`).
- `purpose` is hard-coded to `'pii'` in both `piiBinding` and the encrypt/decrypt calls — do not pass a different purpose; that would break key-ring selection.
- Key rotation is documented in `docs/tools/security.md` ("Database credential and key rotation") and is independent of the TOTP / webhook key rings.
