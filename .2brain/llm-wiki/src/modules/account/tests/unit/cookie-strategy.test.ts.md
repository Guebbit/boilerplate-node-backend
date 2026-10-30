---
source: src/modules/account/tests/unit/cookie-strategy.test.ts
sha256: f1b79bc1fb89bff490fc45a0dd6233cc5092a074a044cfff6daf8a4374209f9d
generated_at: 2026-10-29T03:03:57.376603+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/cookie-strategy.test.ts

## Purpose

Unit tests for the `cookie` mode session strategy adapter (`cookie-strategy.ts`). They verify three operations in isolation: credential extraction from a request (`credentialOf`), bearer/cookie resolution against the session store (`resolveBearer` / `resolveCookie`), and session minting (`issue`). The session store, account read, and proof resolver are all replaced with mocks; their real behaviour is covered by `../integration/session-modes.test.ts`.

## Key elements

- **`describe('credentialOf')`** — asserts the strategy picks the `ses_`-shaped Bearer token over a cookie, is case-insensitive on the scheme, falls back to the cookie when the Bearer is a JWT, and returns `undefined` when neither is present.
- **`describe.each(['resolveBearer', 'resolveCookie'])`** — parameterised suite run against both resolution paths. Covers: malformed rejection (no store hit), JWT-as-revoked, lookup-by-digest (never raw id), unknown id → revoked, wrong-mode row → revoked, past-expiry → expired, valid row → proof delegated to `resolveProof`, missing-proof defaults (`authTime: 0, amr: []`), inactive account → `ok: undefined` with no `touch`, 1-minute `touch` cooldown, and resilience when `touch` rejects.
- **`describe('issue')`** — minting guards: user-not-found rejection, `SecondFactorRequiredError` when 2FA is armed but proof lacks the factor, `StaleProofError` when proof predates `tokensValidAfter`, and `authTime` storage in seconds (truncated from ms).
- **`USER_ID`, `SHOPPER`, `SOME_ID`** — shared fixtures: a fixed account id, its resolved context object, and a well-formed-but-never-minted `ses_…` id.
- **`sessions`, `users`, `proof`** — typed mock handles created via `asStub`, giving typed access to the jest mocks.
- **`insertedRow()`** — reads the argument of the last `sessions.insert` call as a `NewSessionRow`.
- **`liveRow(overrides?)`** — factory producing a valid `cookie`-mode session row (1 h expiry) with optional overrides.
- **Module mocks** — `jest.mock` for `@modules/users`, `@modules/account/repository`, `@modules/account/session/auth-context` (fully replaced), and `@modules/access`.

## Relationships

- **`src/modules/account/session/cookie-strategy.ts`** — the system under test; every assertion targets its exported `cookieStrategy` object.
- **`src/modules/account/session/mint-guard.ts`** — source of `SecondFactorRequiredError` and `StaleProofError`, asserted in `issue` tests.
- **`src/modules/account/session/auth-context.ts`** — `resolveProof` is the sole export mocked; tests verify *whether* it is called and with what arguments, not its semantics.
- **`src/modules/account/repository.ts`** — `sessionRepository` methods are spied on; `findByHash`, `insert`, `touch` are the primary doubles.
- **`src/modules/users/index.ts`** — `userService.findAuthenticatableById` and `touchLastActive` are stubbed for `issue` / resolve tests.
- **`src/modules/access/index.ts`** — `accessService.rolesOf` is stubbed to return a neutral (tenant-less, platform-less) role set.
- **`src/infrastructure/security/hash-token.ts`** — `hashToken` is used to confirm the strategy hashes the id before store lookup.
- **`src/modules/account/tests/strategy-doubles.ts`** — provides `requestWith`, `recordingResponse`, and `cookieSet` helpers shared with other strategy tests.
- **`src/types/index.ts`** — supplies the `RememberTier` type used in issue assertions.
- **`tests/support/environment.ts`** — `setEnvironment` seeds `NODE_SESSION_TIME_SHORT` / `NODE_SESSION_TIME_LONG` for deterministic TTL calculations.
- **`tests/support/stub.ts`** — `asStub` gives typed mock handles over plain `jest.fn()` replaces.

## Notes

- `beforeEach` calls `jest.resetAllMocks()` (not `clearAllMocks`) so that any resolution set in a prior case cannot leak into the next; the comment in the file calls this out explicitly.
- The `auth-context` mock is **total** (not a partial spread) because the test's contract is "was the resolver asked?" — anything beyond that belongs to integration tests.
- `SOME_ID` is deliberately a valid *shape* (`ses_` + 43 chars) that no row holds; it exercises the lookup path without coupling to a real mint.
- The resolve suite is written once and replayed over both `resolveBearer` and `resolveCookie` via `describe.each`, so any divergence between the two paths fails both parameter rows.
- The `touch` cooldown test sets `lastUsedAt` to "now" (no call), then to 61 s ago (one call), then to `undefined` (one call) — confirming the boundary is strictly > 60 s.
