---
source: src/modules/account/tests/unit/jwt-strategy.test.ts
source_sha256: cb86a744991388105d6897f2298cca9f736ab2bb7b8bc918d54d6214d3be77a4
context_sha256: 8aa39569ab869504197765f5b0302b03f33084035263f7623bd5cc64dfab040a
generated_at: 2026-11-22T04:06:10.247544+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/jwt-strategy.test.ts

## Purpose
Unit tests for the `jwt` mode session adapter (`src/modules/account/session/jwt-strategy.ts`). They check the wiring between the session strategy port and the token layer. The cases cover which mint a login uses versus a re-mint, which value goes into which cookie, and how a token refusal becomes a resolver miss while an outage stays a rejection. The token layer itself is tested elsewhere (`./session-jwt.test.ts`) and is mocked out here.

## Key elements
- **Module mocks:**
  - `@modules/account/session/jwt` is replaced with `jest.fn()` doubles. The real `TokenRejection` class is kept.
  - `@modules/account/repository` keeps the real exports but swaps the `sessionRepository` methods the strategy uses for mocks.
  - `@modules/account/session/auth-context` has `resolveProof` mocked.
- **Typed handles:** `tokens`, `sessions` and `proof` are created with `asStub` for typed access to the mocks. `USER_ID`, `SHOPPER` and `FAMILY_ID` are shared fixtures.
- **`beforeEach`:** resets all mocks, sets `NODE_SESSION_TIME_MEDIUM=86400` via `setEnvironment`, and installs default resolved values for the mints and the store calls.
- **`describe('issue')`:**
  - Mints through `startSession`, not `continueSession`.
  - Sets the refresh cookie `__Host-session` and the `isAuth` cookie.
  - Returns `{ token: 'access-token' }`.
  - The cookies are session-scoped unless a remember tier is given. A medium tier gives `maxAge` 86,400,000 ms.
  - The `bearer` transport makes no difference.
- **`describe('reissue')`:**
  - Re-mints through `continueSession`.
  - Takes the remember tier from the presented refresh cookie (`rememberOfRefreshToken`), or from `snapshot` when the row is already deleted.
  - Retires the old session with `removeByHash(hashToken(old))`.
  - When a session row is found, it continues the same family and expiry, then calls `removeFamilyExcept`.
  - Still answers with the new session if retiring the old one fails.
- **`describe('remint')`:**
  - Sets a fresh refresh cookie and returns `{}` with no access token.
  - A failed re-mint is swallowed: it returns `{}` and sets no cookie.
- **`describe.each` for `resolveBearer` / `resolveCookie`:**
  - These use `verifyAccessToken` and `verifyRefreshToken` respectively.
  - Claims (`sub`, `auth_time`, `amr`, `sid`) are passed to `resolveProof` as `{ authTime, amr }`.
  - A `TokenRejection` becomes `{ miss: <reason> }`.
  - Any other error is rethrown.
- **`describe('resolveBearer and the session it names')`:** sets up a valid access token and a resolved proof. Its cases are cut off in the provided content.

## Relationships
- Targets `src/modules/account/session/jwt-strategy.ts` (`jwtStrategy`).
- Replaces `src/modules/account/session/jwt.ts`, `src/modules/account/repository.ts` (`sessionRepository`) and `src/modules/account/session/auth-context.ts` (`resolveProof`) with mocks.
- Uses `hashToken` from `src/infrastructure/security/hash-token.ts` to compute expected hashes.
- Uses `cookieSet`, `recordingResponse` and `requestWith` from `src/modules/account/tests/strategy-doubles.ts`.
- Uses `RememberTier` from `src/types/index.ts`.
- Uses `asStub` (`tests/support/stub.ts`) and `setEnvironment` (`tests/support/environment.ts`).

## Notes
- The `jest.mock` calls come before the imports of the modules under test, and they use `requireActual` to keep the real `TokenRejection` and the rest of the repository.
- The tests distinguish a refused token (a miss) from an outage (a rejection), so the guard can tell the two apart.
