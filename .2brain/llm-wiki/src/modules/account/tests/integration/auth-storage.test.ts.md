---
source: src/modules/account/tests/integration/auth-storage.test.ts
sha256: d1ee7f8497885f4683c4028dbdc54b5e1b60877db8cf1e9d1079355fc70a8bbe
generated_at: 2026-11-14T19:01:44.366668+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-storage.test.ts

## Purpose

Integration tests for `sessionRepository` and `verificationTokenRepository` that run against a real database. They verify behaviours a mock can only self-confirm: atomic single-claim under concurrency, one-live-link upsert semantics, TTL/purge date clamping, family-scoped cascading deletes, and the closed-vocabulary guard on token kinds.

## Key elements

- **`requestWithCookie(credential?)`** — local helper that builds a stub `SessionRequest` carrying an optional `__Host-session` cookie, used by the `sessionsList` tests.
- **`describe('sessionRepository.supersede')`** — asserts exactly one winner among `RACE_SIZE` concurrent callers; `purgeAt` is clamped to `expiresAt` when the retention window would overshoot it; `cookie`-mode rows are never rotated.
- **`describe('sessionRepository.listLive')`** — filters by account, mode, and liveness; orders newest sign-in first.
- **`describe('sessionRepository.removeFamily')`** — removes the live row plus rotated predecessors in one call; cannot cross account boundaries.
- **`describe('sessionRepository.removeByHash')`** — single-row delete; unknown hash is a no-op (returns 0).
- **`describe('sessionRepository.touch')`** — stamps `lastUsedAt` only on the matching row; throttled writes fire at most once per interval.
- **`describe('what the TTL monitor deletes')`** — exercises `reapDueSessions` (from factories) to confirm only past-`purgeAt` rows are removed.
- **`describe('sessionsList')`** — API-level: deduplicates same-family rows, marks the caller's session `current`, never leaks token hashes or raw tokens in the JSON payload; no-credential callers get all `current: false`.
- **`describe('verificationTokenRepository.issue')`** — one-live-kind replaces prior link atomically (race-safe); many-live-kind accumulates; `amr` is cleared when not re-supplied; unknown `type` is rejected by the Mongoose schema enum.
- **`describe('verificationTokenRepository.findLive / spend')`** — `findLive` matches on kind + digest + liveness; `spend` uses `withTransaction` so exactly one of `RACE_SIZE` concurrent callers wins.

## Relationships

- **`src/modules/account/repository.ts`** — the primary subject under test; `sessionRepository` and `verificationTokenRepository` are called directly.
- **`src/modules/account/services/sessions.ts`** — provides `sessionsList` (and `eraseSessionsAndTokens`, `exportSessions`) tested at the service level.
- **`src/modules/account/tests/factories.ts`** — supplies `plantSession`, `plantToken`, `reapDueSessions`, and all row/query helpers used to seed and inspect state.
- **`src/modules/users/tests/factories.ts`** — `createUser` seeds a real user row before each test.
- **`tests/support/race.ts`** — `raceN` / `RACE_SIZE` drive the concurrency assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` connects a real (or in-memory) DB at module load.
- **`tests/support/stub.ts`** — `asStub` casts a plain object to the `SessionRequest` interface for the `sessionsList` tests.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps the atomic spend operation.
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` produces the digests stored and queried throughout.
- **`src/modules/account/session/strategy.ts`** — source of the `SessionRequest` type used by the cookie helper.

## Notes

- `setupTestDb()` runs at module top-level (outside `beforeAll`), so the DB is ready before any `describe` body executes.
- The `@ts-expect-error` on the `verificationTokenRepository.issue` call is intentional: it passes a `type` outside the schema enum to prove the DB (not TypeScript) rejects it.
- `sessionModel` is imported from `../../model` but is not referenced in the visible test bodies; it may be used in the truncated tail or is a residual import.
- The "duplicate-a / duplicate-b" family test encodes the invariant that two refreshes inside the grace window leave two rows, but `sessionsList` collapses them into one displayed session.
