# src/modules/account/tests/unit/tokens.test.ts

## Purpose

Unit tests for the token-configuration module (`session/config.ts`). Validates that each JWT tier (short/medium/long refresh, access) reads its own dedicated environment variable, that unset or empty variables resolve to `0` (seconds) or `''` (secrets) rather than `NaN`/`undefined`, and that the access-token and refresh-token paths never cross-contaminate.

## Key elements

- **`TOKEN_ENV_KEYS`** — typed array of every env var the config module reads; drives the per-test save/clear/restore cycle so no ambient value can leak into assertions.
- **`beforeEach` / `afterEach` hooks** — snapshot then delete all six token env vars before each test; restore (or re-delete) after. Prevents cross-test pollution and interaction with `tests/support/setup.ts`.
- **`describe('getExpiryTime')`** — asserts per-tier var routing (distinct values to catch swapped map entries), fallback to `NODE_TOKEN_ACCESS_TIME` when no tier is passed, `0` for unset, `0` for empty string, and base-10 parsing (`'0900'` → 900, not octal).
- **`describe('getExpiryTimeMilliseconds')`** — confirms the seconds value is multiplied by exactly 1000, that tier routing mirrors `getExpiryTime`, and that unset yields `0` (not `NaN`).
- **`describe('token secrets')`** — verifies `getAccessTokenSecret` / `getRefreshTokenSecret` read `NODE_TOKEN_ACCESS` and `NODE_TOKEN_REFRESH` respectively, and default to `''` when unset.
- **`describe('getAccessTokenTTL')`** — confirms it reads `NODE_TOKEN_ACCESS_TIME`, returns `0` when unset, and does **not** read any `NODE_TOKEN_REFRESH_TIME_*` variable.

## Relationships

- **`src/modules/account/session/config.ts`** — sole import target. This file exercises `RefreshTokenExpiryTime`, `getExpiryTime`, `getExpiryTimeMilliseconds`, `getAccessTokenSecret`, `getRefreshTokenSecret`, and `getAccessTokenTTL`. No other module is imported.

## Notes

- Empty-string env vars must resolve to `0`, not `NaN`. The tests document *why*: a `NaN` in `expiresIn` makes `jsonwebtoken` throw, and a `NaN` `maxAge` on a cookie is silently dropped by Express (producing a session cookie instead of a persistent one) — both failures are silent in production.
- Secrets default to `''` rather than `undefined` because `jsonwebtoken` throws on `undefined` but accepts `''`; the contract is that misconfiguration surfaces at the signing call, not at config-parse time.
- The no-arg call to `getExpiryTime` / `getExpiryTimeMilliseconds` is specified to read `NODE_TOKEN_ACCESS_TIME` and to **ignore** all refresh-tier variables entirely; the tests set refresh vars simultaneously to prove the split holds.
- Zero-padded numeric values (e.g. `'0900'`) must be parsed as base 10; the test guards against accidental `parseInt` without an explicit radix.
