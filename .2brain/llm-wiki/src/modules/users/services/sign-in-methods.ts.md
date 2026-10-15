---
source: src/modules/users/services/sign-in-methods.ts
sha256: 6938faf5e0983f68073a093326db4431b14c8eacc6997eae99076711656f4649
generated_at: 2026-10-15T12:11:51.214295+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/sign-in-methods.ts

## Purpose

Builds the `signInMethods` section of a GDPR Art. 15 account data export. It reports *which* sign-in methods an account holds (linked OAuth providers, armed 2FA methods) without exposing any secret material. It is a separate section from the main `profile` export because the underlying fields (`oauthAccounts`, `twoFactorMethods`) live behind `select: false` on the User document and would not appear in a plain profile projection.

## Key elements

- **`exportSignInMethods(userId: string): Promise<ExportSignInMethods | undefined>`** — The sole export. Resolves to:
  - `providers` — mapped from `user.oauthAccounts`; each entry carries `provider`, `providerId`, and `connectedAt` (as ISO string).
  - `twoFactor` — mapped from `user.twoFactorMethods`, filtered to only methods with a non-null `enrolledAt`; each entry carries `method` and `enrolledAt` (as ISO string).
  - `undefined` when the user does not exist (caller omits the section and lets `profile` answer the 404).

## Relationships

- **`src/modules/users/repository.ts`** — Imports `userRepository` and calls `findByIdWithCredentials(userId)` to fetch the user document *with* the `select: false` credential fields.
- **`src/types/index.ts`** — Imports the `ExportSignInMethods` return-type definition.
- **`src/modules/users/services/index.ts`** — Re-exports this module's public surface so consumers import from the services barrel.

## Notes

- A 2FA method with no `enrolledAt` is an abandoned setup that never guarded a login; it is silently dropped from the export, not returned as a partial entry.
- The function returns `undefined` (not `{}`) for a missing user — the assembly layer is responsible for omitting the section entirely.
- Timestamps are serialized to ISO-8601 strings at this layer; the repository layer returns `Date` objects.
