# src/modules/account/tests/unit/cookies.test.ts

## Purpose

Unit tests for the four cookie functions exported by `src/modules/account/session/cookies.ts`. They verify that the `jwt` refresh-token cookie and the `isAuth` UI-hint cookie are set and cleared with the correct flag combination (httpOnly, secure, sameSite, path, maxAge), because a single wrong flag turns an XSS bug into an account takeover or a logout into a no-op.

## Key elements

- **`makeResponse()`** – local helper that returns a plain object with `cookie: jest.fn()` and `clearCookie: jest.fn()`, cast via `asStub` to a typed `Response`. No external mock framework is needed beyond this.
- **`describe('createRefreshCookie')`** – asserts `name = 'jwt'`, `httpOnly: true`, `sameSite: 'lax'`, `path: '/'`, `secure` tracks `NODE_ENV`, and `maxAge` derives from the passed `RefreshTokenExpiryTime` tier (or falls back to the access-token window).
- **`describe('destroyRefreshCookie')`** – asserts `clearCookie` is called with the *same* flag set used at creation; explicitly checks production `secure` propagation.
- **`describe('createLoggedCookie')`** – asserts `name = 'isAuth'`, value `'true'`, **no** `httpOnly` (frontend must read it), and `maxAge` matches the refresh-cookie tier so the hint never outlives the credential.
- **`describe('destroyLoggedCookie')`** – asserts `clearCookie('isAuth', { path: '/' })`.
- **`beforeEach` / `afterEach`** – sets real env values (`NODE_TOKEN_REFRESH_TIME_SHORT = '3600'`, `NODE_TOKEN_ACCESS_TIME = '900'`) so `maxAge` assertions exercise actual config wiring; restores original env (handling `undefined` via `delete`).

## Relationships

- **`src/modules/account/session/cookies.ts`** – the module under test; all four exported functions (`createRefreshCookie`, `destroyRefreshCookie`, `createLoggedCookie`, `destroyLoggedCookie`) are imported and exercised.
- **`src/modules/account/session/config.ts`** – supplies `RefreshTokenExpiryTime`, passed as the expiry-tier argument in the `createRefreshCookie` / `createLoggedCookie` calls.
- **`tests/support/stub.ts`** – provides `asStub`, a type-level cast used to make the plain mock object assignable to `Response & { cookie: jest.Mock; clearCookie: jest.Mock }`.

## Notes

- Flags are asserted **individually** (not via a single `toEqual` blob) so a regression that swaps `httpOnly` between the two cookies is caught immediately.
- The `secure` flag is tested in two separate `it` blocks by toggling `NODE_ENV`; there is no global mock of `process.env` — the real variable is mutated and restored.
- `asStub` is a compile-time-only assertion; at runtime `makeResponse()` just returns an object with two `jest.fn()`s. Do not expect `response.cookie` to carry any Express internals.
- The test file header comment (the long doc block) doubles as a design rationale for *why* each flag matters — treat it as the spec these tests encode.
