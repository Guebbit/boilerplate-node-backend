---
source: src/modules/users/tests/integration/external-key-lookups.test.ts
sha256: 5a167226cd59a6edd3c6ec1d93517fe0c22fde3042c473aaf389369722c410d7
generated_at: 2026-10-29T06:20:28.234010+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/external-key-lookups.test.ts

## Purpose

Integration tests proving that user-lookup methods keyed on externally supplied values (email, OAuth subject) reject MongoDB query operators (e.g. `{"$ne": null}`) when they arrive where a plain string is expected, rather than silently matching all documents. The file documents that the cast-to-string path is the last line of defence if Zod validation is bypassed.

## Key elements

- **`operatorAsString()`** — Returns `JSON.parse('{"$ne": null}')` cast `as string`; simulates a malicious operator arriving at a string-typed parameter.
- **`CAST_FAILURE`** — Regex (`/Cast to string failed/u`) matched against the expected rejection message from the repository layer.
- **`describe('external-key lookups')`** — One `beforeEach` creates a real user and links a Google OAuth account; eight `it` blocks then exercise `userService.findForLogin`, `findByEmail`, `emailTaken`, `emailOrPendingEmailTaken`, and `findByOAuthIdentity` with both the operator (expecting rejection) and a legitimate value (expecting a match).
- **First test** (`"an unsanitized lookup WOULD match everyone…"`) — Calls `userRepository.findOne` directly with the raw operator to *demonstrate* the vulnerability exists below the service layer.
- **Banned-account test** — Confirms that a trusted repository-level filter (`active: false`) still correctly excludes a user from `findForLogin` while the record remains countable.

## Relationships

- **`src/modules/users/services/index.ts`** — `userService` is the primary system under test; every public lookup method that accepts an email or OAuth subject is exercised here.
- **`src/modules/users/repository.ts`** — `userRepository` is used directly in the setup (to link an OAuth account) and in the first test to prove the raw operator *would* succeed at the data-access layer, isolating the cast failure to the repository's string-path guard.
- **`src/modules/users/tests/factories.ts`** — `createUser` supplies deterministic test fixtures (real and banned accounts).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module load to ensure a clean in-memory database for the `describe` block.

## Notes

- The file's own JSDoc makes explicit that `as string` on `JSON.parse` output is the *only* runtime guard tested here; in production, Zod at the service boundary is the intended primary defence. The tests exist to verify the fallback.
- The first test is intentionally a *positive* match (the operator succeeds at the repository level) to anchor the proof: the service-layer tests that follow are what must keep that path closed.
- `operatorAsString()` is not exported; it is a module-private helper used only within this file.
