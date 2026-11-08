---
source: src/modules/account/tests/integration/auth-storage.test.ts
sha256: 4245644b321d1e8bae943476759f1817ca89e2cb9033380b2dce4e30000bb3ca
generated_at: 2026-11-08T04:34:42.842866+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-storage.test.ts

## Purpose

Integration tests that verify `sessionRepository` and `verificationTokenRepository` behave correctly against a **real database** (via Mongoose + `setupTestDb`). They cover behaviours that unit-level mocks cannot validate: atomic "one-live-link" upserts, concurrent-claim races, TTL/purge semantics, family-level deletion, and the closed vocabulary of verification-token kinds.

## Key elements

- **`requestWithCookie(credential?)`** – Builds a `SessionRequest` stub (via `asStub`) carrying an optional `__Host-session` cookie, used by the `sessionsList` tests.
- **`describe('sessionRepository.supersede')`** – Verifies exactly one concurrent caller wins a claim, that `purgeAt` is clamped to the row's own `expiresAt`, and that `cookie`-mode rows are never rotated.
- **`describe('sessionRepository.listLive')`** – Confirms filtering by owner, mode (`jwt`), liveness, and newest-first ordering.
- **`describe('sessionRepository.removeFamily')`** – Checks bulk deletion of a family (live + predecessors) and that it cannot target another account's sessions.
- **`describe('sessionRepository.removeByHash')`** – Single-row deletion and no-op on unknown hash.
- **`describe('sessionRepository.touch')`** – `lastUsedAt` stamping on the matched row only, plus throttled write (at most once per interval).
- **`describe('what the TTL monitor deletes')`** – `reapDueSessions()` removes only past-`purgeAt` rows.
- **`describe('sessionsList')`** – One row per session (deduplicated by family), marks the caller's own session `current`, and leaks no credential/token material.
- **`describe('verificationTokenRepository.issue')`** – One-live-kind replacement (atomic, race-safe), many-live-kind retention, `amr` not carried across replacement, and schema-level rejection of unknown kinds.
- **`describe('verificationTokenRepository.findLive / spend')`** – Correct lookup by kind + digest + expiry, and single-winner spend under concurrent race.

## Relationships

- **`@modules/account/repository`** – The primary system under test: `sessionRepository` and `verificationTokenRepository`.
- **`@modules/account/services/sessions`** – Tests the higher-level `sessionsList` service (and imports `eraseSessionsAndTokens`, `exportSessions` though the visible portion exercises `sessionsList`).
- **`@modules/account/tests/factories`** – Provides all seeding and inspection helpers (`plantSession`, `plantToken`, `reapDueSessions`, `sessionRowFor`, `tokenRowsOf`, etc.).
- **`@modules/users/tests/factories`** – `createUser` to provision accounts before seeding sessions/tokens.
- **`@tests/support/race`** – `raceN` / `RACE_SIZE` drive the concurrency-atomicity assertions.
- **`@tests/support/setup-test-db`** – `setupTestDb()` initialises the real in-memory/test database at module scope.
- **`@tests/support/stub`** – `asStub` wraps a plain object into a typed `SessionRequest` without pulling in an HTTP framework.
- **`@infrastructure/security/hash-token`** – `hashToken` produces the deterministic digests that every session/token row stores.
- **`@infrastructure/runtime/database`** – `withTransaction` is imported (available for the repository's atomic writes under test).
- **`@modules/account/session/strategy`** – Source of the `SessionRequest` type used to shape test requests.
- **`@modules/account/model`** – `sessionModel` is imported (used by the test DB setup / Mongoose registration).

## Notes

- `setupTestDb()` runs at **module top-level** (not inside `beforeAll`), so the test database is ready before any `describe` block registers.
- Concurrency tests rely on `raceN(RACE_SIZE, …)`; the exact `RACE_SIZE` lives in `tests/support/race` and is intentionally larger than 1 to make race conditions observable.
- The "refuses a kind outside the closed vocabulary" test uses `@ts-expect-error` to deliberately pass an invalid enum value into `issue`, confirming the **schema** (not application code) rejects it.
- The file is truncated in the visible portion; the `findLive / spend` suite likely continues with additional spend-semantics cases beyond what is shown.
