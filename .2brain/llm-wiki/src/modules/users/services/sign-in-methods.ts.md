---
source: src/modules/users/services/sign-in-methods.ts
sha256: 6938faf5e0983f68073a093326db4431b14c8eacc6997eae99076711656f4649
generated_at: 2026-11-08T08:52:04.032627+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/sign-in-methods.ts

## Purpose

Produces the `signInMethods` section of a GDPR Art. 15 account data export: the linked OAuth providers and armed second factors an account holds, expressed as non-secret facts. It exists as a separate section because those credential fields live behind `select: false` on the User document and therefore are not reachable through the plain `profile` projection.

## Key elements

- **`exportSignInMethods(userId: string)`** — The sole export. Resolves to `ExportSignInMethods | undefined`.
  - `providers`: maps `user.oauthAccounts` to `{ provider, providerId, connectedAt }` (ISO-string dates).
  - `twoFactor`: flat-maps `user.twoFactorMethods`, keeping only entries that have an `enrolledAt` (i.e. completed enrollment) as `{ method, enrolledAt }`.
  - Returns `undefined` when `findByIdWithCredentials` finds no user.

## Relationships

- **`src/modules/users/repository.ts`** — Imports `userRepository` and calls `findByIdWithCredentials(userId)` to obtain the full document including the `select: false` credential fields that the plain `profile` query does not return.
- **`src/types/index.ts`** — Imports the `ExportSignInMethods` return type.
- **`src/modules/users/services/index.ts`** — Sibling export section; the parent assembly collects this alongside other sections and omits the block when the result is `undefined`.

## Notes

- A two-factor method with no `enrolledAt` (abandoned mid-setup) is intentionally excluded; it never guarded a login and is therefore not a "way in."
- The function never emits secrets: no second-factor codes, no delivery state, no backup-code digests, no password hash.
- When the user does not exist the function returns `undefined` rather than throwing; the caller (assembly layer) is responsible for omitting the section, and the `profile` section is expected to surface the 404.
