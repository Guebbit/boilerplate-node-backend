---
source: src/modules/account/tests/integration/auth-storage.test.ts
sha256: 4245644b321d1e8bae943476759f1817ca89e2cb9033380b2dce4e30000bb3ca
generated_at: 2026-10-29T02:54:02.488445+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/auth-storage.test.ts

## Purpose

Integration tests that exercise `sessionRepository` and `verificationTokenRepository` against a real MongoDB instance. They verify concurrency guarantees (atomic claims, one-live-link upserts), TTL/expiry semantics, and account-scoping rules that a mocked store cannot self-validate.

## Key elements

- **`requestWithCookie(credential?)`** — helper that builds a `SessionRequest` stub carrying (or omitting) the `__Host-session` cookie.
- **`sessionRepository.supersede`** — tests: exactly one concurrent caller wins; `purgeAt` is clamped to the row's own `expiresAt` when that is sooner; `cookie`-mode rows are never rotated away.
- **`sessionRepository.listLive`** — returns only the caller's live `jwt` rows, newest first, excluding rotated, expired, wrong-mode, and other-account rows.
- **`sessionRepository.removeFamily`** — removes a live row plus its rotated predecessors in one call; is scoped to the owning account (attacker gets `0`).
- **`sessionRepository.removeByHash`** — removes a single session by hash; unknown hash is a no-op; siblings survive.
- **`sessionRepository.touch`** — stamps `lastUsedAt` only on the matched row; respects a throttle interval (at most one write per interval).
- **TTL monitor (`reapDueSessions`)** — deletes rows past `purgeAt` and nothing else.
- **`sessionsList`** — one row per family (dedupes grace-window duplicates), marks the caller's own as `current`, and never leaks token material in the response.
- **`verificationTokenRepository.issue`** — one-live kinds replace the prior link atomically (race-safe); many-live kinds accumulate; stale `amr` is not carried forward; unknown kinds are rejected by the schema enum.
- **`verificationTokenRepository.findLive` / `spend`** — finds by `(kind, hash)` at a point in time, rejecting wrong kind / expired / unknown; `spend` is atomic under race (exactly one winner).

## Relationships

- **`src/modules/account/repository.ts`** — the primary SUT; every `describe` block calls its `sessionRepository` or `verificationTokenRepository` methods.
- **`src/modules/account/model.ts`** — provides `sessionModel` (imported but used indirectly through the repositories); defines the Mongoose schema the tests assert against.
- **`src/modules/account/services/sessions.ts`** — source of `sessionsList`, `eraseSessionsAndTokens`, and `exportSessions` exercised in the "what the TTL monitor deletes" and "sessionsList" blocks.
- **`src/modules/account/session/strategy.ts`** — supplies the `SessionRequest` type used by `requestWithCookie`.
- **`src/modules/account/tests/factories.ts`** — `plantSession`, `plantToken`, `reapDueSessions`, `sessionRowFor`, `sessionHashesOf`, `sessionRowsOf`, `tokenRowsOf`, `tokenTypesOf`; the primary seeding/assertion helpers.
- **`src/modules/users/tests/factories.ts`** — `createUser` creates the account rows every test needs.
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` used to compute the expected digests and to seed tokens.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` imported (the tests validate that the repositories' internal transactions are atomic under race).
- **`tests/support/race.ts`** — `raceN` / `RACE_SIZE` drives the concurrent-winner assertions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` called at module top to provision a clean MongoDB before any test runs.
- **`tests/support/stub.ts`** — `asStub` casts a plain object to the `SessionRequest` interface without a real HTTP context.

## Notes

- Tests rely on **wall-clock dates** (`new Date()`, `Date.now() ± offset`) rather than a clock-mock, so TTL assertions are relative, not absolute.
- The "one-live" vs "many-live" token kinds (`password` vs `mfa-challenge`) are the core domain invariant under test; `issue` for one-live kinds is an upsert, for many-live kinds it is a plain insert.
- `supersede` only rotates `jwt`-mode rows; `cookie`-mode rows are a hard refusal (`resolves.toBe(false)`), not an error.
- The `sessionsList` test seeds two rows sharing a `familyId` to simulate the grace-window duplicate that a refresh produces mid-window; the service must collapse them to one displayed session.
- The `@ts-expect-error` on the `made-up` token type is intentional: it documents that the Mongoose enum is the enforcement point, not application code.
