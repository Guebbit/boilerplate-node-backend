# src/modules/account/tests/unit/tokens.test.ts

## Purpose

Unit tests for the token-configuration helpers in `@modules/account/session/config`. The module under test is pure env-var parsing whose output directly controls JWT lifetimes and signing secrets, so the tests pin the documented contract (per-tier variable mapping, fallbacks, and numeric coercion) rather than re-deriving behavior from the implementation.

## Key elements

- **`TOKEN_ENV_KEYS`** – Const array of all six env vars the module reads (`NODE_TOKEN_REFRESH_TIME_{SHORT,MEDIUM,LONG}`, `NODE_TOKEN_ACCESS_TIME`, `NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`). Used by the save/restore hooks to guarantee a clean environment per test.
- **`beforeEach` / `afterEach`** – Save original values, delete all token env vars before each test, and restore (or re-delete) after. Prevents ambient or `tests/support/setup.ts` leakage.
- **`describe('getExpiryTime')`** – Verifies per-tier variable routing, the no-arg fallback to `NODE_TOKEN_ACCESS_TIME`, the `0`-when-unset contract, empty-string → `0` (not `NaN`), and base-10 parsing (no octal surprise).
- **`describe('getExpiryTimeMilliseconds')`** – Confirms the ms helper is exactly `seconds × 1000`, honours the same tier routing, and still returns `0` (not `NaN`) when unset.
- **`describe('token secrets')`** – Checks that access and refresh secrets come from separate variables and fall back to `''` (not `undefined`).
- **`describe('getAccessTokenTTL')`** – Pins that the access TTL reads only `NODE_TOKEN_ACCESS_TIME`, returns `0` when unset, and never inherits a refresh-tier value.

## Relationships

- **`src/modules/account/session/config.ts`** – The sole import target. All six named exports (`RefreshTokenExpiryTime`, `getExpiryTime`, `getExpiryTimeMilliseconds`, `getAccessTokenSecret`, `getRefreshTokenSecret`, `getAccessTokenTTL`) are the units under test; the tests exercise them exclusively through their public contract.
- **`tests/support/setup.ts`** – Referenced in a comment as a potential source of pre-set env vars; the save/restore hooks exist specifically to neutralise its effect.

## Notes

- Assertions are written against the module's *documented contract*, not its internals. If the implementation refactors (e.g., swaps a `switch` for a map), tests should still pass as long as the contract holds.
- Distinct numeric values (`3600` / `86400` / `2592000`) are chosen deliberately so that two tiers accidentally wired to the same variable would be caught.
- The empty-string → `0` and base-10 tests guard against `parseInt` edge cases that would otherwise surface as runtime failures in `jsonwebtoken` or silently dropped cookie `maxAge` headers—failures with no associated error.
- The access/refresh separation test (`getAccessTokenTTL` must ignore refresh-tier vars) is the primary regression guard against the most dangerous misconfiguration: an access token inheriting a multi-day refresh lifetime.
