---
source: src/modules/account/tests/unit/session-listing.test.ts
sha256: c484bd5d6887fba45e20fcd2a6bf82202cb766d414a4e278bb53d7dd6e190d0a
generated_at: 2026-11-08T04:50:10.184162+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/session-listing.test.ts

## Purpose

Unit tests for the session-listing module (`listSessions` and `newestPerFamily`). They lock in the published contract: one entry per sign-in family regardless of rotation-race duplicates, the caller's own family marked `current`, optional fields omitted rather than defaulted, account-epoch filtering, and staff idle-timeout visibility.

## Key elements

- **`newestPerFamily` (tested)** — Pure function; keeps exactly one row per `familyId` (the one with the later `_id`), preserving input order across families.
- **`listSessions` (tested)** — Async function; returns a flat array of session entries. Under test for: marking the caller's family `current`, carrying `lastUsedAt`/`device` only when present, dropping rows whose `authTime` predates the account's `tokensValidAfter` epoch, and hiding sessions past a 24 h idle limit when the caller holds a staff role.
- **`row` helper** — Builds a `SessionRow` with a fresh random `_id` and `tokenHash`; accepts `Partial<SessionRow>` overrides for targeted assertions.
- **Partial mocks** — `jest.mock` + `jest.requireActual` pattern on `@modules/account/repository`, `@modules/users`, and `@modules/access` so only the specific methods (`listLive`, `findAuthenticatableById`, `rolesOf`) are replaced with `jest.fn()`.
- **`asStub`** (from `tests/support/stub.ts`) — Extracts typed mock handles from already-mocked module objects.

## Relationships

- **`src/modules/account/session/listing.ts`** — The module under test; provides `listSessions` and `newestPerFamily`.
- **`src/modules/account/repository.ts`** — Source of `sessionRepository.listLive`, which is the store the listing reads from; mocked to control returned rows.
- **`src/modules/users/index.ts`** → **`src/modules/users/services/index.ts`** — Provides `userService.findAuthenticatableById`, used to fetch the account (including `tokensValidAfter` for epoch filtering); mocked.
- **`src/modules/access/index.ts`** → **`src/modules/access/services/index.ts`** — Provides `accessService.rolesOf`, consulted to determine staff vs. shopper for the idle-timeout rule; mocked to return role shapes.
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` is called inside the `row` helper and in test assertions to produce realistic token-hash values without depending on a real credential.
- **`tests/support/stub.ts`** — Supplies `asStub`, the typed-unwrap utility used throughout the file.

## Notes

- "Current" marking is **family-level**, not row-level: if the caller's token matches any row in a family (even the older, rotated-away one), the single published entry for that family is `current: true`.
- Rows lacking an `authTime` field are **always kept**, even when the account has a `tokensValidAfter` epoch — there is no proof to judge.
- The staff idle-timeout test uses a relative 24-hour window (`Date.now() − 24 h`), so the assertion is time-dependent but tolerant of drift within the test run.
- The file's module-level doc comment is the authoritative restatement of the listing contract; treat it as the spec the tests enforce.
