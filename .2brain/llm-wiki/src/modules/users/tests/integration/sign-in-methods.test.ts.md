---
source: src/modules/users/tests/integration/sign-in-methods.test.ts
sha256: 63117723d32f599317640bba4e13c1857ebce6303fea6376e47d03e8c5a51ccf
generated_at: 2026-11-14T22:39:25.534387+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/sign-in-methods.test.ts

## Purpose

Integration tests for `exportSignInMethods`. They verify the exported section returns only the factual "what" (linked OAuth providers, armed two-factor methods with their enrollment date) and never the "how-to-open" material (secrets, in-flight codes, backup-code digests, salts). They also pin the exclusion rules: unconfirmed factors are omitted, and a missing user yields `undefined` so the caller can drop the section.

## Key elements

- **`describe('exportSignInMethods')`** – single suite covering four scenarios.
- **Test 1 – full export shape** – Creates a user with a Google OAuth link and two 2FA methods (TOTP + email) plus backup codes, then asserts the result contains *only* `{provider, providerId, connectedAt}` and `{method, enrolledAt}` entries. Implicitly asserts absence of `secret`, `codeHash`, `codeExpiresAt`, `codeAttempts`, `twoFactorBackupCodes`, and `twoFactorBackupCodeSalt`.
- **Test 2 – unconfirmed factor excluded** – A TOTP entry that has a `secret` but no `enrolledAt` is treated as not-yet-active; the export returns empty lists.
- **Test 3 – password-only account** – No providers, no 2FA → both arrays empty.
- **Test 4 – non-existent user** – Passing a fabricated 24-char hex ID is asserted with `toBeUndefined()`, signalling the assembly layer should omit the section entirely.
- **`LINKED_AT` / `ARMED_AT`** – Fixed `Date` constants so `.toISOString()` comparisons are exact rather than relative.

## Relationships

- **`src/modules/users/services/sign-in-methods.ts`** – Source of `exportSignInMethods`, the function under test.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser` (seeds a user document with 2FA fields and backup codes) and `userRepository` (used here to attach an OAuth link to the test user).
- **`tests/support/setup-test-db.ts`** – Called once at module level via `setupTestDb()` to initialise the in-memory test database.
- **`src/modules/users/repository.ts`** – Indirect dependency; the `userRepository` exported by the factories delegates to the real repository for the OAuth-link write, so the test exercises the actual persistence path.

## Notes

- The module doc comment states the contract explicitly: the section is "facts" (links, armed factors); secrets, in-flight codes, and backup-code digests must never appear. The tests encode that contract.
- "Unconfirmed" is defined by the *absence* of `enrolledAt`, not by a flag. A TOTP entry with a secret but no `enrolledAt` is considered pending setup and is filtered out.
- The non-existent-user case asserts `toBeUndefined()`, not an empty object. Callers that build a composite user payload rely on this to skip the section rather than render empty arrays.
