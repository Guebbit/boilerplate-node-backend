---
source: src/modules/users/services/reencrypt.ts
sha256: 8face9787d99719b13ab0173c4d2802921d481670e95f0fac631ee519f7a30ad
generated_at: 2026-11-08T08:51:28.533607+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/reencrypt.ts

## Purpose

Provides user-scoped re-encryption operations for the two encrypted fields stored on the `users` collection: phone numbers (PII) and per-method 2FA secrets. It is the user-module half of the key-rotation pipeline orchestrated by the `reencrypt` ops script in `@infrastructure/security/reencrypt`. It deliberately never imports the `account` module; 2FA secret metadata is passed in by the caller that owns that ring.

## Key elements

- **`reencryptUserPhones(dryRun?: boolean)`** — Re-encrypts every user's `phone` field onto the newest key in the PII ring. Builds an `EncryptedField` per document with binding derived from `piiBinding(phoneAad(userId))`. Delegates the actual read/write to `userRepository.reencrypt`.
- **`TwoFactorSecretRing`** (interface) — The contract the `account` module satisfies to hand over its secret ring. Exposes `ring: readonly VersionedKey[]` and `bindingOf(methodId) → SecretBinding`.
- **`reencryptTwoFactorSecrets(secrets: TwoFactorSecretRing, dryRun?: boolean)`** — Re-encrypts each enrolled `twoFactorMethods[].secret` onto the newest key of the caller-supplied ring. Selects the normally-hidden `twoFactorMethods` array and builds one `EncryptedField` per method entry, binding via `secrets.bindingOf(method._id)`.
- **`EncryptedField`** (type import) — The shared shape consumed by the repository's `reencrypt` method; defines `path`, `stored`, `binding`, and `label`.

## Relationships

- **`@infrastructure/security/pii-encryption`** — Imports `getPiiEncryptionKeyRing` (current PII ring) and `piiBinding` (AAD-aware binding for phone).
- **`@infrastructure/security/versioned-secret`** — Imports `VersionedKey` and `SecretBinding` types used by `TwoFactorSecretRing`.
- **`@infrastructure/security/reencrypt`** — Imports the `EncryptedField` type that structures each per-document field descriptor.
- **`../model`** — Imports `UserDocument` (shape of a user row) and `phoneAad` (computes the AAD value for phone encryption).
- **`../repository`** — Calls `userRepository.reencrypt(…)` to perform the actual Mongo read-reencrypt-write loop.
- **`../services/index.ts`** — Re-exports the two functions so the user service barrel is the public entry point.
- **`account` module** (not a direct import) — Constructs a `TwoFactorSecretRing` and calls `reencryptTwoFactorSecrets`; the boundary keeps user and account modules decoupled.

## Notes

- `twoFactorMethods` is declared with `select: false` on the model. `reencryptTwoFactorSecrets` explicitly opts in with `select: '+twoFactorMethods'`; omitting this would silently skip all secrets.
- `dryRun` defaults to `false`. When `true`, the repository counts candidate documents but performs no writes — safe for pre-prod validation.
- The phone binding uses the **user's** `_id` as AAD; the 2FA secret binding uses the **method's** `_id`. Mixing these up would break decryption.
- This module is intentionally thin: all read/write logic lives in `userRepository.reencrypt`. Adding a new encrypted user field means adding one more `EncryptedField` entry, not a new function.
