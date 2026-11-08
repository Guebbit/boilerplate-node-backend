---
source: src/modules/account/tests/factories.ts
sha256: e6193b10cbc66e86a0f5fc260426c452f7e15ad5f35e113aeeeb998ca08077f0
generated_at: 2026-11-08T04:33:37.904891+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/factories.ts

## Purpose

Test helper module that plants session rows and one-time token rows with known plaintext into the database, and reads back the rows an account holds. It exists so test suites (including those in other modules) can set up credentials and assert on leftover state without going through the full application flow or a repository the module barrel doesn't publish.

## Key elements

- **`PlantedToken` / `plantToken`** — Stores a one-time token (plaintext chosen by the test) via `verificationTokenRepository.issue` (the same upsert path a real issuance uses, so one-live-link semantics apply). Options: `ttlMs`, `sentAt`, `amr`.
- **`PlantedSession` / `plantSession`** — Creates a session row directly via `sessionModel.create`. Options: `familyId`, `mode`, `ttlMs`, `startedAt`, `supersededAt`, `lastUsedAt`. Returns the plain `SessionRow`.
- **`dropAllSessions(userId)`** — Deletes every session for an account (mirrors a revocation).
- **`dropSessionOf(plaintext)`** — Deletes the single session whose token matches.
- **`sessionRowsOf(userId)`** — All session rows (live or expired), sorted by `_id`.
- **`reapDueSessions()`** — Deletes sessions whose `purgeAt ≤ now`; simulates the DB TTL monitor a test can't wait for.
- **`sessionHashesOf` / `tokenHashesOf` / `tokenTypesOf`** — Project single fields from the full row lists.
- **`sessionRowFor(plaintext)`** — Look up one session by its token hash (live or dead).
- **`tokenRowsOf(userId)`** — All token rows, sorted by `_id`.
- **`ageTokenSend(userId, type, ageMs)`** — Shifts a token's `sentAt` into the past via a Mongoose update pipeline, so resend cooldowns expire.
- **`removeTokensOfKind(userId, type)`** — Deletes all tokens of one type (bypasses cooldown / one-live constraints).
- **`tokenRowOf(userId, type)`** — Returns the first token row of a given type, or `undefined`.
- **`MintedSession` / `mintSession(userId, options?)`** — Opens a session through `activeStrategy().issue` with a stubbed Express request/response; returns a `bearer` header and a `cookie` header string usable in both `jwt` and `cookie` modes.

## Relationships

- **`@domain-primitives/time`** — Imports `DAY_MS` and `HOUR_MS` as default TTLs for `plantSession` and `plantToken`.
- **`@infrastructure/security/hash-token`** — Imports `hashToken` to derive the stored hash from the test-chosen plaintext.
- **`@kernel/cookies`** — Imports `SESSION_COOKIE` to name the cookie in `mintSession`'s return value.
- **`../domain/session-proof`** — Imports `AMR` so `mintSession` can default the proof to `AMR.password`.
- **`../model`** — Imports `sessionModel` / `verificationTokenModel` for direct `create`, `find`, `deleteMany`, and `updateOne` calls.
- **`../repository`** — Imports `sessionRepository` / `verificationTokenRepository` for `issue`, `removeAll`, `removeByHash`, `findByHash`, and `removeOfTypes`.
- **`../session/strategy`** — Imports `activeStrategy`, `IssueOptions`, and `SessionRequest` for `mintSession`.
- **Consumers** — The six contract test suites (`api`, `code-delivery`, `lifecycle`, `oauth`, `reauth`, `two-factor`) and the `auth-events` integration test all import helpers from this file, as does `tests/contract/support.ts`.

## Notes

- `plantToken` uses the repository's **upsert** path; `plantSession` uses `sessionModel.create` directly. This asymmetry means planting a second token of the same type replaces the first, while planting a second session adds a new row.
- `reapDueSessions` calls `new Date()`, so it respects whatever clock the test harness has frozen (e.g. Sinon fake timers) — the same trick the code under test relies on.
- `ageTokenSend` requires the Mongoose `{ updatePipeline: true }` flag; omitting it makes Mongoose reject the aggregation-pipeline `$subtract` update.
- `mintSession` always passes `transport: 'bearer'` and reads the session credential from either `issued.token` (cookie mode) or the cookie stub (jwt mode). Callers get a uniform `{ bearer, cookie }` pair regardless of the active mode.
- The module deliberately lives outside `../index` so that tests in *other* modules can import it by path without the barrel needing to re-export internal repositories.
