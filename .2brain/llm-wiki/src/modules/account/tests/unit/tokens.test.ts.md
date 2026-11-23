---
source: src/modules/account/tests/unit/tokens.test.ts
source_sha256: 8efa497afa375432361ed9e236ee5b72ef7bf3dd0ba97577033e556515ac3811
context_sha256: bb6cfe16adc35088462e00896efb9298e6ce77ac4b1117dca5b531aa5c03281b
generated_at: 2026-11-22T04:09:31.911360+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/unit/tokens.test.ts

## Purpose
Unit tests for the session/token configuration module imported from `@modules/account/session/config`. That module is pure env-var parsing, but each value sets a JWT lifetime or signing secret, so a wrong variable silently yields sessions that are too long or too short. The tests pin down the documented contract: each tier reads its own env var, falls back to defaults, parses seconds as integers, and each signing ring defaults to the empty ring rather than `undefined`.

## Key elements
- `TOKEN_ENV_KEYS` — every env var the module reads (`NODE_SESSION_MODE`, `NODE_SESSION_TIME_SHORT/MEDIUM/LONG`, `NODE_TOKEN_ACCESS_TIME`, `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`, `NODE_TOKEN_ROTATION_GRACE_MS`, `NODE_TOKEN_REUSE_WINDOW_MS`). It is passed to `withoutEnvironmentInThisFile` so each test starts with them cleared.
- `windowProblems(grace?, reuse?)` — helper that runs `sessionConfig.slice.inspect(...)` with `NODE_ENV: 'production'` and returns the `checks` array.
- `describe('getExpiryTime')` — checks the distinct env var per `RememberTier`. With no tier it uses the short tier and ignores `NODE_TOKEN_ACCESS_TIME`. Unset or empty values fall back to the tier default (86,400 for short, 2,592,000 for long). Parsing is base 10, so `'0900'` gives 900.
- `describe('getExpiryTimeMilliseconds')` — the seconds value times 1000, with the same tier routing, and never `NaN`.
- `describe('token signing rings')` — `getAccessTokenRing` and `getRefreshTokenRing` return a one-element ring for a plain value. A comma-separated value becomes an ordered ring, newest first. Unset gives `[]`.
- `describe('the access-token TTL')` — `getAccessExpiryTime` reads `NODE_TOKEN_ACCESS_TIME` and falls back to 600 (also for an empty value). It ignores the refresh tier variables.
- `describe('getCookieMaxAgeMilliseconds')` — returns the tier in milliseconds, or `undefined` (a browser-session cookie) when no tier was ticked.
- `describe('the token windows check')` — the boot check requires the reuse window to be strictly greater than the grace window. It passes for 10000 against 86400000 and on the defaults. It reports an exact error message when the reuse window equals or is shorter than the grace window.
- `describe('getSessionMode')` — defaults to `jwt`. Values are trimmed and case-insensitive (`'  Cookie '` gives `cookie`). An unknown value throws with a message mentioning `NODE_SESSION_MODE`.
- `describe('the boot gate for the signing rings')` — uses `assertConfigIn([sessionConfig.slice], ...)` with a production-shaped config containing placeholder secrets. `jwt` mode refuses the placeholders, naming `NODE_TOKEN_ACCESS, NODE_TOKEN_REFRESH`. `cookie` mode does not require them, even when unset, and reads the mode trimmed and in any case. A further test covers the reuse-window check in a mode with no rotation. The file is cut off partway through that test, so its remaining assertions are not covered here.

## Relationships
- `src/modules/account/session/config.ts` — the module under test. Its getters and `sessionConfig` are imported.
- `src/infrastructure/config/define.ts` — provides `assertConfigIn`, used to exercise the slice's boot gate directly.
- `src/types/index.ts` — provides `RememberTier` (`short`, `medium`, `long`) for the tier arguments.
- `tests/support/environment.ts` — provides `setEnvironment` and `withoutEnvironmentInThisFile`, which set and clear env vars.

## Notes
- Env vars are cleared before each test so that ambient values (including those from `tests/support/setup-environment.ts`) cannot make an assertion pass.
- Tests use distinct values per tier so that swapped or shared variables are detected.
- Several fallback tests exist because an unusable value would otherwise become `NaN`. `NaN` is rejected by jose as `expiresIn`, and Express silently drops a `NaN` cookie `maxAge`.
- The empty-ring default is the shape a test run sees. Outside test, the boot gate refuses an unset ring.
