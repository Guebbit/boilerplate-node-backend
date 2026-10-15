---
source: src/modules/users/services/reencrypt.ts
sha256: 8face9787d99719b13ab0173c4d2802921d481670e95f0fac631ee519f7a30ad
generated_at: 2026-10-15T12:11:26.288637+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/reencrypt.ts

## Purpose

Provides the user-side re-encryption operations used by the ops script (`@infrastructure/security/reencrypt`) to rotate phone numbers and 2FA secrets onto newer encryption keys. It deliberately keeps the `users` module free of any `account` import: the 2FA key ring is passed in by the caller rather than fetched here.

## Key elements

- **`reencryptUserPhones(dryRun?)`** — Walks every user document that has a `phone` field and re-encrypts it onto the newest PII ring key. Uses `piiBinding(phoneAad(userId))` for the AAD binding.
- **`TwoFactorSecretRing`** (interface) — Describes what the `account` module must supply: the `ring` of `VersionedKey[]` and a `bindingOf(methodId)` function that produces the per-method `SecretBinding`.
- **`reencryptTwoFactorSecrets(secrets, dryRun?)`** — Walks every user's `twoFactorMethods` array and re-encrypts each entry's `secret` onto the newest key of the caller-supplied ring. Uses index-based MongoDB paths (`twoFactorMethods.<i>.secret`).

## Relationships

- **`../repository`** — Calls `userRepository.reencrypt(opts, dryRun)`; the repository owns the actual MongoDB `find` / `update` loop.
- **`../model`** — Imports `phoneAad` (AAD helper) and the `UserDocument` type.
- **`@infrastructure/security/pii-encryption`** — Imports `getPiiEncryptionKeyRing` and `piiBinding` for phone re-encryption.
- **`@infrastructure/security/reencrypt`** — Imports the `EncryptedField` type that shapes each field handed to the repository.
- **`@infrastructure/security/versioned-secret`** — Imports `SecretBinding` and `VersionedKey` types used in the `TwoFactorSecretRing` interface.
- **`src/modules/account/services/reencrypt.ts`** — The intended caller of `reencryptTwoFactorSecrets`; it builds the `TwoFactorSecretRing` and invokes this function. No direct import exists in either direction (the dependency flows one-way at the call site).
- **`src/modules/users/services/index.ts`** — Barrel file that re-exports these functions.

## Notes

- `twoFactorMethods` is hidden by default on the document schema (`select: false`). The re-encrypt call must explicitly add `select: '+twoFactorMethods'` or the field will be absent at runtime.
- The 2FA secret path uses the **array index**, not the method `_id`, because that is how the value is stored in MongoDB. The binding, however, is derived from `method._id` via the caller's `bindingOf`.
- Both functions default `dryRun` to `false`; pass `true` to count affected documents without writing.
