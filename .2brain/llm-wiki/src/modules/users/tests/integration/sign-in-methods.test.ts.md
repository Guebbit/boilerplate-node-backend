---
source: src/modules/users/tests/integration/sign-in-methods.test.ts
sha256: d0b8de83e305e7b521fda06f278db2ac34402d44638d84a9c4c2d365ca2ba5d7
generated_at: 2026-10-15T12:15:52.769444+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/sign-in-methods.test.ts

## Purpose

Integration tests for `userService.exportSignInMethods`, verifying that the export section returns only non-sensitive "facts" about a user's sign-in methods (linked OAuth providers, armed two-factor methods) and never leaks secrets, in-flight codes, or backup-code digests.

## Key elements

- **`LINKED_AT` / `ARMED_AT`** — fixed `Date` constants so the ISO-string fields in the expected output are compared exactly, avoiding flakiness from "now".
- **`setupTestDb()`** — initialises an in-memory test database before the suite runs.
- **`describe('userService.exportSignInMethods')`** — four test cases:
  - *lists the linked providers and the armed factors, and nothing that opens them* — seeds a TOTP + email factor (with secret, codeHash, backup digests) plus a Google OAuth link, then asserts the export contains only `provider`, `providerId`, `connectedAt`, `method`, `enrolledAt`.
  - *leaves out a factor whose setup was never confirmed* — a TOTP entry without `enrolledAt` is treated as pending and excluded from the export.
  - *answers empty lists for an account that holds only a password* — returns `{ providers: [], twoFactor: [] }`.
  - *answers nothing for an account that is gone* — returns `undefined` (not an empty object), signalling the caller to omit the section.

## Relationships

- **`src/modules/users/services/index.ts`** — source of `userService`, the system under test; the test calls `userService.exportSignInMethods`.
- **`src/modules/users/tests/factories.ts`** — provides `createUser` (seeds user documents including two-factor fields) and `userRepository` (used to `linkOAuthAccount`).
- **`tests/support/setup-test-db.ts`** — provides `setupTestDb`, which the test calls to configure a disposable database connection.
- **`src/modules/users/repository.ts`** — underlying persistence layer that `userRepository` (via factories) and `userService` (via services) delegate to; the test does not import it directly.

## Notes

- The export contract is **security-sensitive**: the tests explicitly assert that `secret`, `codeHash`, `codeExpiresAt`, `codeAttempts`, `twoFactorBackupCodes`, and `twoFactorBackupCodeSalt` are absent from the result. Any future change that adds these fields will break the test.
- A two-factor method is considered "armed" only when it carries an `enrolledAt` timestamp; methods without one are silently dropped.
- A non-existent user id yields `undefined`, not `null` or `{}`. Callers (e.g., an account-export assembler) are expected to omit the entire section when the value is `undefined`.
