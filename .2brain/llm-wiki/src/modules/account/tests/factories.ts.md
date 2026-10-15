---
source: src/modules/account/tests/factories.ts
sha256: c7a2f5738fae9cd98d01a7b9d12289e534cae4180730dcc33db5cfd601ba64a6
generated_at: 2026-10-15T10:09:54.687044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/factories.ts

## Purpose

Test fixture helpers for the account module's **sessions** and **verification tokens**. Provides "plant" functions to seed rows with known plaintexts and "read" functions to assert what a flow left behind. Lives in the account module's test directory (rather than a shared test-utils package) because the barrel does not publish the repository — suites in other modules import these helpers from here.

## Key elements

- **`plantToken(userId, type, plaintext, options?)`** — Upserts a one-time token via `verificationTokenRepository.issue`, so one-live-link kinds replace prior rows. Accepts `ttlMs` (negative = already expired), `sentAt`, and `amr`.
- **`plantSession(userId, plaintext, options?)`** — Creates a session row via `sessionModel.create` with a known credential hash. Accepts `familyId`, `mode` (default `'jwt'`), `ttlMs`, `startedAt`, `supersededAt`, `lastUsedAt`. Returns a `SessionRow`.
- **`mintSession(userId, options?)`** — Opens a session through `activeStrategy().issue` (the real code path), bypassing 2FA/password. Returns a `MintedSession` with `bearer` and `cookie` headers ready for an HTTP request. Works in both `jwt` and `cookie` session modes.
- **`dropAllSessions(userId)` / `dropSessionOf(plaintext)`** — Bulk and single-session deletion, mirroring real revocation.
- **`sessionRowsOf(userId)` / `tokenRowsOf(userId)`** — Full row reads (live or expired), sorted by `_id`.
- **`sessionHashesOf` / `tokenHashesOf` / `tokenTypesOf`** — Convenience projections of the row reads above.
- **`sessionRowFor(plaintext)`** — Looks up a single session by credential hash (via `sessionRepository.findByHash`).
- **`reapDueSessions()`** — Deletes rows whose `purgeAt` has passed, simulating the DB TTL monitor that runs ~once/minute.
- **`ageTokenSend(userId, type, ageMs)`** — Rewinds a token's `sentAt` into the past so a resend cooldown is already elapsed.
- **`removeTokensOfKind(userId, type)`** — Deletes all tokens of one kind (escape hatch past cooldowns / one-live rules).
- **`tokenRowOf(userId, type)`** — Returns the single token row of a given kind, if any.
- **Interfaces:** `PlantedToken`, `PlantedSession`, `MintedSession` — option/result shapes for the functions above.

## Relationships

- **`src/infrastructure/security/hash-token.ts`** — Every "plaintext" parameter is hashed via `hashToken` before storage or lookup, matching the production path.
- **`src/kernel/cookies.ts`** — `SESSION_COOKIE` name is used in `mintSession` to read the cookie the strategy sets on the stub response.
- **`src/modules/account/domain/session-proof.ts`** — `AMR` enum is passed as the default `amr` claim in `mintSession`.
- **`src/modules/account/model.ts`** — `sessionModel` and `verificationTokenModel` (Mongoose models) are the read/write targets for most helpers.
- **`src/modules/account/repository.ts`** — `sessionRepository` and `verificationTokenRepository` are used for operations that must respect repository-level invariants (e.g. `issue` upsert semantics, `removeAll`, `removeByHash`, `findByHash`).
- **`src/modules/account/session/strategy.ts`** — `activeStrategy()` is called by `mintSession` to exercise the real issuance path; `IssueOptions` and `SessionRequest` types shape its call signature.
- **`src/modules/account/tests/contract/support.ts`** — The contract-test harness that consumes these factories.
- **Contract tests** (`api`, `lifecycle`, `reauth`, `two-factor`) and **integration tests** (`auth-events`, `auth-storage`, `cookie-hardening`, `delete-account`) all import plant/read helpers from this file.

## Notes

- `plantToken` goes through the repository's `issue` (an upsert) to honour one-live-link replacement; `plantSession` goes through `sessionModel.create` directly because there is no analogous repository upsert for sessions.
- `ageTokenSend` uses a Mongoose aggregation-pipeline update (`$subtract`) and must pass `{ updatePipeline: true }` — Mongoose rejects a bare array in `updateOne` otherwise.
- `reapDueSessions` exists because the TTL monitor runs on a ~60 s interval; tests cannot wait, so they trigger the same `deleteMany({ purgeAt: { $lte: now } })` manually.
- `mintSession` stubs an Express `Request`/`Response` pair just enough to satisfy the strategy's signature; the real strategy logic (cookie writing, token generation, AMR stamping) still runs.
- The `bearer` field in `MintedSession` is a `` `Bearer ${string}` `` literal type so callers get a compile-time guarantee of the prefix.
