---
source: src/modules/account/tests/factories.ts
sha256: 2b1f2f845e2b24dd12b51f2f35978ce5c1d3a0b2ead5401598debec2333708e0
generated_at: 2026-10-14T09:06:47.222143+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/factories.ts

## Purpose

Test-factory helpers for the account module's `sessions` and `verificationtokens` collections. They let any test suite plant rows with a known plaintext, read back what an account holds, manipulate timestamps, and mint a real session through the active strategy — without depending on a repository barrel that the module does not publish to other modules.

## Key elements

- **`plantToken`** – Stores a one-time token whose plaintext the test chose, via `verificationTokenRepository.issue` (same upsert path as production). Accepts `ttlMs` (negative → already expired), `sentAt`, and `amr`.
- **`plantSession`** – Creates a session row via `sessionModel.create` with a known `tokenHash`. Accepts `familyId`, `mode`, `ttlMs` (negative → expired), `startedAt`, `supersededAt`, `lastUsedAt`. Returns the full `SessionRow`.
- **`dropAllSessions` / `dropSessionOf`** – Delete all of an account's sessions, or the one matching a given plaintext (a single-session logout).
- **`sessionRowsOf` / `tokenRowsOf`** – Read every session or token row for an account, sorted by `_id`, via `.lean()`.
- **`reapDueSessions`** – `deleteMany` where `purgeAt ≤ now`, replicating what the DB TTL monitor does (which tests cannot wait ~1 min for).
- **`sessionHashesOf` / `tokenHashesOf` / `tokenTypesOf`** – Convenience projections over the row lists above.
- **`sessionRowFor`** – Look up the single session matching a plaintext hash (live or dead).
- **`ageTokenSend`** – Subtracts `ageMs` from `sentAt` using a Mongoose aggregation-pipeline update so a resend cooldown has "elapsed".
- **`removeTokensOfKind`** – Deletes all tokens of one type for an account (bypass cooldown / one-live-link rules).
- **`tokenRowOf`** – Find the single token row of a given type, if any.
- **`mintSession`** – Calls `activeStrategy().issue` with a stubbed Express request/response to open a real session in whichever mode the suite runs. Returns `{ bearer, cookie }` ready to use as `Authorization` / `Cookie` headers. Defaults `amr` to `[AMR.password]`.
- **Interfaces** – `PlantedToken`, `PlantedSession`, `MintedSession` document the optional overrides each factory accepts.

## Relationships

- **`src/infrastructure/security/hash-token.ts`** – Imports `hashToken` to derive the stored digest from the test's chosen plaintext.
- **`src/kernel/cookies.ts`** – Imports `SESSION_COOKIE` to name the cookie stub in `mintSession` and to read the refresh token back.
- **`src/modules/account/domain/session-proof.ts`** – Imports `AMR` to default the proof list in `mintSession`.
- **`src/modules/account/model.ts`** – Imports `sessionModel`, `verificationTokenModel` (Mongoose models) and the `SessionDocument` type for direct `.create` / `.find` / `.deleteMany` calls.
- **`src/modules/account/repository.ts`** – Imports `sessionRepository` and `verificationTokenRepository` for `issue`, `removeAll`, `removeByHash`, `findByHash`, `removeOfTypes`; also the `SessionRow` / `VerificationTokenRow` row types.
- **`src/modules/account/session/strategy.ts`** – Imports `activeStrategy`, `IssueOptions`, `SessionRequest`; `mintSession` delegates entirely to the strategy so the same call works in both `jwt` and `cookie` modes.
- **Test consumers** (contract & integration suites under `tests/contract/` and `tests/integration/`) import these helpers to set up and assert on session/token state without reaching into repository internals.

## Notes

- `plantToken` goes through the repository's `issue` upsert, so a one-live-link type replaces any existing token automatically; `plantSession` uses `sessionModel.create` directly (bypasses the repository) because a session does not have the same one-per-kind constraint.
- `ageTokenSend` requires the `{ updatePipeline: true }` option — Mongoose rejects an array update (aggregation pipeline) unless explicitly told it is one.
- A **negative** `ttlMs` on either plant helper produces an already-expired row, useful for asserting expiry paths without waiting.
- `mintSession` reads the refresh token from the stubbed `response.cookie` call *or* falls back to `issued.sessionToken`; the bearer credential comes from `issued.token` (jwt mode) or `issued.sessionToken` (cookie mode). If both are absent it throws, so a misconfigured strategy fails loudly.
- The file is a plain module (no class, no DI) so cross-module test suites can `import` it directly without pulling in an unbarrelled repository.
