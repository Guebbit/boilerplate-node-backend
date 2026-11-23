---
source: src/modules/account/tests/unit/cookie-strategy.test.ts
source_sha256: baa5d20adfed7e2a40232739e9ac914ee20f2e4247bdaf889fd9f1b8146b6b51
context_sha256: 5a8c96d856b587ea23efb195f1f2edd556e396f65498342c4ecf5cd1f2028828
generated_at: 2026-11-22T04:04:18.216057+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/cookie-strategy.test.ts

## Purpose
Unit tests for the `cookie` session mode's adapter (`cookieStrategy` in `src/modules/account/session/cookie-strategy.ts`). They cover which credential a request names, how a presented session id resolves, and where a newly minted id is handed back. The session store, account read, proof resolver and role lookup are all mocked. What the queries actually do is covered by `src/modules/account/tests/integration/session-modes.test.ts`, which uses a real store over HTTP.

## Key elements
- **Module mocks** (`jest.mock`):
  - `accountUserService` keeps the real module but replaces `findAuthenticatableById` and `touchLastActive`.
  - `sessionRepository` keeps the real module but replaces `insert`, `findByHash`, `removeByHash`, `touch`, `familyActivity`, `touchFamily`, `removeFamily` and `listLive`.
  - `resolveProof` from `auth-context` is fully replaced.
  - `accessService.rolesOf` is replaced and defaults to `{ tenant: null, platform: null }`.
- **Typed stubs**: `sessions`, `users` and `proof`, created with `asStub`.
- **Helpers**:
  - `insertedRow()` returns the last row passed to `sessions.insert`, and throws if there is none.
  - `liveRow(overrides)` builds a stored `cookie` row that expires in an hour and is keyed by `hashToken(SOME_ID)`.
- **Constants**: `USER_ID`, `SHOPPER` (the resolved caller, with no tenant or platform roles) and `SOME_ID` (`ses_` plus 43 `a` characters).
- **`beforeEach`**: calls `jest.resetAllMocks()`, restores the `rolesOf` default, and sets `NODE_SESSION_TIME_SHORT=3600` and `NODE_SESSION_TIME_LONG=2592000` via `setEnvironment`. It also sets default resolutions for `insert`, `removeByHash`, `touch`, `touchLastActive` and `findAuthenticatableById`.
- **`describe('credentialOf')`**:
  - A `ses_` bearer wins over the cookie.
  - The bearer scheme is case-insensitive.
  - A non-session bearer, such as a JWT, falls back to the cookie.
  - A request with neither yields `undefined`.
- **`describe.each` over `resolveBearer` and `resolveCookie`**:
  - A malformed id returns `{ miss: 'malformed' }` with no lookup.
  - A JWT returns `revoked`, with no lookup.
  - The lookup is by `hashToken(id)`, never the raw id.
  - An unknown id, or a row whose mode is `jwt`, returns `revoked`.
  - A row past `expiresAt` returns `expired`.
  - A live row's stored `authTime` and `amr` are passed to `resolveProof`, and its context is returned as `ok`. A row with no stored proof is passed as `{ authTime: 0, amr: [] }`.
  - If the proof resolves to `undefined`, the result is `{ ok: undefined }` and `touch` is not called.
  - `touch` is called only when `lastUsedAt` is more than 61 seconds old or missing.
  - `sessionClock` carries `{ lastActiveAt, startedAt }`. It is the saved stamp when no stamp is written, including for `{ passive: true }` requests, and roughly now when a stamp is written.
  - The result is still `ok` when `touch` rejects.
- **`describe('issue')`**: the visible cases are that a missing account rejects with `User not found` and inserts nothing, and that a first session on an armed account (`twoFactorEnabledAt` set) whose proof lacks the factor is refused with nothing stored. The case body is cut off in the visible content. The imports bring in `SecondFactorRequiredError`, `StaleProofError`, `cookieSet`, `recordingResponse`, `requestWith` and `RememberTier`.

## Relationships
- Tests `src/modules/account/session/cookie-strategy.ts` (`cookieStrategy`) directly.
- Imports `SecondFactorRequiredError` and `StaleProofError` from `src/modules/account/session/mint-guard.ts`.
- Mocks `src/modules/account/session/auth-context.ts` (`resolveProof`), which is shared with `jwt` mode.
- Mocks `sessionRepository` from `src/modules/account/repository.ts` and imports its `NewSessionRow` type. It mocks `accountUserService` from `src/modules/users/friends/account.ts` and `accessService` from `src/modules/access/index.ts`.
- Uses `hashToken` from `src/infrastructure/security/hash-token.ts` to compute expected digests.
- Uses `cookieSet`, `recordingResponse` and `requestWith` from `src/modules/account/tests/strategy-doubles.ts` to build requests and record responses.
- Uses `asStub` (`tests/support/stub.ts`) and `setEnvironment` (`tests/support/environment.ts`). `RememberTier` comes from `@types` (`src/types/index.ts`).

## Notes
- `resetAllMocks` is used rather than `clearAllMocks` so that no leftover resolution leaks into the next case. The defaults must therefore be re-applied in `beforeEach`.
- Each `jest.mock` spreads the real module and overrides only specific members. Other exports stay real.
- A JWT presented to the cookie strategy, and a `jwt`-mode row, are treated as `revoked` rather than forged. The tests describe them as credentials left over from a mode switch.
