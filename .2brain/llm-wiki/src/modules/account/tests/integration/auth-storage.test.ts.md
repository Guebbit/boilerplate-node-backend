---
source: src/modules/account/tests/integration/auth-storage.test.ts
sha256: 663f4429c1f048c8f00a3ada5b292ec5801a119f0d3c58e37befa514e14824da
generated_at: 2026-10-15T10:10:43.902157+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-storage.test.ts

## Purpose

Integration tests that exercise `sessionRepository` and `verificationTokenRepository` against a real database. The focus is on behaviours that depend on genuine storage semantics—atomic concurrent claims, one-live-link upsert idempotency, TTL/purge window capping, and cross-account isolation—that a mocked store cannot actually verify.

## Key elements

- **`sessionRepository.supersede` suite** — asserts exactly one of N concurrent callers wins a token claim; verifies `purgeAt` is capped at the row's own `expiresAt`; confirms `cookie`-mode rows are never rotated.
- **`sessionRepository.listLive` suite** — confirms filtering by account, mode, and liveness, and ordering by newest sign-in first.
- **`sessionRepository.removeFamily` suite** — checks bulk removal of live + superseded rows in one family, and that a foreign caller cannot delete another account's family.
- **`sessionRepository.removeByHash` suite** — single-row deletion; unknown hash is a safe no-op returning 0.
- **`sessionRepository.touch` suite** — stamps `lastUsedAt` only on the matched row; verifies write throttling (at most one write per interval).
- **TTL monitor suite** (`reapDueSessions`) — deletes rows past `purgeAt`, leaves others untouched.
- **`sessionsList` suite** — deduplicates two live rows sharing a `familyId` into one entry, marks the caller's own session as current via the `__Host-session` cookie, and asserts no credential/token material appears in the response.
- **`verificationTokenRepository.issue` suite** — one-live kinds (`password`) upsert to a single row; many-live kinds (`delete`, `mfa-challenge`) accumulate; `amr` is reset (not carried) on replacement; unknown kinds are rejected by the schema enum.
- **`verificationTokenRepository.findLive` / `spend` suite** — lookup by kind + hash with liveness check; concurrent spends resolve to exactly one winner.
- **`requestWithCookie` helper** — builds a stub `SessionRequest` carrying the `__Host-session` cookie (or none).

## Relationships

- **`src/modules/account/repository.ts`** — the system under test; `sessionRepository` and `verificationTokenRepository` are the primary objects under test.
- **`src/modules/account/services/sessions.ts`** — `sessionsList` (and `eraseSessionsAndTokens`, `exportSessions`) are tested here at the storage-integration level.
- **`src/modules/account/tests/factories.ts`** — provides all planting/assertion helpers (`plantSession`, `plantToken`, `sessionRowFor`, `tokenRowsOf`, `reapDueSessions`, etc.).
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds a real user row before each scenario.
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` is used to compute the digest that the repository expects.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` is imported (used by the repositories under test for atomicity).
- **`src/modules/account/session/strategy.ts`** — `SessionRequest` type shapes the stub request in the `sessionsList` tests.
- **`src/modules/account/model.ts`** — `sessionModel` imported (referenced for schema-level guarantees).
- **`tests/support/race.ts`** — `raceN` / `RACE_SIZE` drive concurrent-claim and concurrent-spend assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions a real database for the whole file (called once at module scope).
- **`tests/support/stub.ts`** — `asStub` wraps plain objects into the expected request type.

## Notes

- `setupTestDb()` runs at **module top level**, not inside a `beforeEach`; the database connection is shared across all tests in this file.
- Race tests use `raceN(RACE_SIZE, …)` — the concurrency degree is a single constant from `tests/support/race.ts`; changing it affects every concurrent-claim assertion here.
- The enum-rejection test relies on `@ts-expect-error` to pass a value the Mongoose schema forbids; the test would silently pass if the schema ever stops enforcing the enum, so the comment is load-bearing.
- `sessionsList` deduplication is exercised with two live rows sharing a `familyId` (the "grace-window" shape left by two refreshes); the test asserts the response collapses them and never exposes the raw token hash.
- The file does **not** import or test `eraseSessionsAndTokens` or `exportSessions` in the visible portion; they are imported but may be used in truncated sections or may be vestigial.
