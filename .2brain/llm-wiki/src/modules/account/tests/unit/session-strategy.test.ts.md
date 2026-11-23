---
source: src/modules/account/tests/unit/session-strategy.test.ts
source_sha256: e0ba30759df3c281ecd82bf72c9cfd5c8e02e6dcf9653167b26b9b01776e43f9
context_sha256: 07b0eb46657297cffe95355efcc48aeaa8c564206f5aa6dfc05de315e85ae018
generated_at: 2026-11-22T04:09:11.905785+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/session-strategy.test.ts

## Purpose
Unit tests for the seam between the account module's two session modes (`jwt` and `cookie`). They verify that the active strategy is chosen per call from `NODE_SESSION_MODE`, that the auth resolver defers to that choice, and that the mint guard enforces second-factor requirements.

## Key elements
- **`describe('activeStrategy')`**
  - With no mode set, it returns `jwtStrategy`.
  - Parameterized over `jwt` and `cookie`, it returns the matching adapter, and its `.mode` equals the mode name.
  - It follows a mode changed after import. Switching `cookie` to `jwt` yields `cookieStrategy` and then `jwtStrategy`, so the choice is not frozen at first use.
- **`describe('accountAuthResolver')`**
  - `cookieAuthenticates()` is `false` in `jwt` mode and `true` in `cookie` mode.
  - In `cookie` mode, `fromBearer` with a JWT-shaped string resolves to `{ miss: 'revoked' }`. The test treats it as a stale credential left by a mode switch, not a forged one.
  - In `cookie` mode, `fromCookie('not-a-session')` resolves to `{ miss: 'malformed' }`.
  - The test title says both are turned away "without a lookup", but the test does not assert that.
- **`describe('assertSecondFactor')`**
  - An account with `twoFactorEnabledAt` set and proof `['pwd']` throws `SecondFactorRequiredError`. The error carries `userId: 'u1'` and `name: 'SecondFactorRequiredError'`.
  - The same account with proof `['pwd', 'otp']` passes.
  - An account with no armed factor (`{ id: 'u2' }`) passes.

## Relationships
- `src/modules/account/session/strategy.ts` supplies `activeStrategy`, which is the main subject under test.
- `src/modules/account/session/cookie-strategy.ts` and `src/modules/account/session/jwt-strategy.ts` supply `cookieStrategy` and `jwtStrategy`. The tests compare against them by identity (`toBe`).
- `src/modules/account/session/resolver.ts` supplies `accountAuthResolver`, which the tests use to check that it consults the active strategy.
- `src/modules/account/session/mint-guard.ts` supplies `assertSecondFactor` and `SecondFactorRequiredError`. The module doc says both adapters call the guard from `issue`, but this file tests it directly and does not exercise `issue`.
- `tests/support/environment.ts` supplies `setEnvironment`, imported via the `@tests/environment` alias. It sets `NODE_SESSION_MODE` per test.

## Notes
- The first `activeStrategy` test relies on `NODE_SESSION_MODE` being unset by default, so it assumes the environment is clean between tests. The file does no cleanup itself, so any reset presumably happens in shared test setup.
- Tests use the `@tests/…` and `@modules/…` path aliases.
