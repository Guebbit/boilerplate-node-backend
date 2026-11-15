---
source: src/modules/account/tests/unit/cookie-strategy.test.ts
sha256: 666e81db9c1c152bb817381c3975dbf481556b27694d81bd5b675b5b80a39028
generated_at: 2026-11-14T19:14:22.155368+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/cookie-strategy.test.ts

## Purpose

Unit tests for the `cookie` session-mode adapter (`cookieStrategy`). Covers three behaviours: which credential a request names (`credentialOf`), how a presented session id resolves against a stored row (`resolveBearer` / `resolveCookie`), and what guards and side-effects apply when a new session is minted (`issue`). The session store, account read, and proof resolver are all replaced with mocks; integration-level behaviour (real store, HTTP transport) is delegated to `../integration/session-modes.test.ts`.

## Key elements

- **`credentialOf` suite** — verifies bearer-header extraction (case-insensitive scheme), fallback to the cookie header when the bearer is not a `ses_` id, and `undefined` when neither is present.
- **`resolveBearer` / `resolveCookie` suite** — a single `describe.each` block runs identical assertions against both entry points:
  - Malformed ids and JWT-shaped strings are rejected as `malformed` / `revoked` **without** hitting `findByHash`.
  - Lookup is always by `hashToken(id)`, never by the raw id.
  - A `jwt`-mode row or an expired row is read as `revoked` / `expired`; `resolveProof` is not called.
  - A live cookie row delegates to `resolveProof(userId, { authTime, amr })` and returns `{ ok: context }`.
  - Missing `authTime`/`amr` are normalised to `{ authTime: 0, amr: [] }`.
  - `sessions.touch` is called only when `lastUsedAt` is > 60 s old (or absent); a `touch` rejection does not fail the resolve.
- **`issue` suite** (partially truncated) — guards: user-not-found, `SecondFactorRequiredError` (2FA armed, factor absent), `StaleProofError` (proof predates `tokensValidAfter`). On success, stamps `authTime` in seconds from `provedAt` and inserts a row via `sessionRepository.insert`.
- **Helpers** — `liveRow(overrides)` builds a realistic `NewSessionRow`; `insertedRow()` extracts the last `insert` argument; `sessions`, `users`, `proof` are typed mock stubs via `asStub`.
- **`beforeEach`** — `jest.resetAllMocks()` (not `clear`), default resolutions for all doubles, and `setEnvironment` for `NODE_SESSION_TIME_SHORT` / `NODE_SESSION_TIME_LONG`.

## Relationships

- **`src/modules/account/session/cookie-strategy.ts`** — the system under test; the test imports `cookieStrategy` and exercises its public surface.
- **`src/modules/account/session/auth-context.ts`** — the `resolveProof` export is fully mocked; tests only assert whether it is called and with what arguments, not what it returns semantically.
- **`src/modules/account/session/mint-guard.ts`** — source of `SecondFactorRequiredError` and `StaleProofError`, asserted as the rejection types in `issue` guards.
- **`src/modules/account/repository.ts`** — the `sessionRepository` export is partially mocked; the `NewSessionRow` type is imported for row construction in helpers.
- **`src/modules/users/friends/account.ts`** — the `accountUserService` export is partially mocked so the strategy's account-read calls can be controlled and asserted.
- **`src/modules/access/index.ts`** — the `accessService` export is mocked to return a neutral `{ tenant: null, platform: null }` so the strategy's role check passes.
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` is used both in test setup (computing `tokenHash` for `liveRow`) and in assertions (verifying the repository received the digest, not the raw id).
- **`src/modules/account/tests/strategy-doubles.ts`** — provides `requestWith`, `recordingResponse`, and `cookieSet` helpers for building fake HTTP requests/responses.
- **`tests/support/stub.ts`** — `asStub` wraps a mocked export so tests can access its call history and return values with the original type signature.
- **`tests/support/environment.ts`** — `setEnvironment` sets the `NODE_SESSION_TIME_*` variables the strategy reads for TTL calculation.
- **`src/types/index.ts`** — `RememberTier` is imported (used in the truncated portion of the `issue` suite for tier-based TTL assertions).

## Notes

- `beforeEach` uses `jest.resetAllMocks()` deliberately (comment: "each case sets its own resolutions, and a leftover one fails the next"). A plain `clearMocks` would leave previous `mockResolvedValue` bindings in place.
- `resolveBearer` and `resolveCookie` share one parameterised body; the test does not verify any difference between the two beyond the entry-point name.
- The `touch` debounce threshold is hard-coded at 60 s in the test (`Date.now() - 61_000`); there is no env variable controlling it.
- `SOME_ID` is a valid `ses_` + 43-char shape but was never minted; tests rely on the shape check, not the value, for the "malformed vs. revoked" distinction.
- The `issue` test file is truncated in the source snapshot; additional tier/TTL cases (using `RememberTier`) likely follow the `authTime` assertion.
