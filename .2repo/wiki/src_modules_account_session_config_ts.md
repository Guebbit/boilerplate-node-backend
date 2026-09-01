# src/modules/account/session/config.ts

## Purpose

Centralises all token-related environment variable reads (expiry durations, signing secrets) into one module. It performs no token issuance or verification itself—callers (`jwt.ts`, `cookies.ts`) consume its values to sign tokens or set cookie `maxAge`.

## Key elements

- **`RefreshTokenExpiryTime`** (enum) — the three "remember me" tiers: `SHORT`, `MEDIUM`, `LONG`.
- **`TOKEN_EXPIRY_ENV`** (internal const) — maps each tier (plus `'default'`) to its `NODE_TOKEN_*` environment variable name.
- **`getExpiryTime(remember?)`** — returns the expiry for a tier in **seconds** (falls back to `NODE_TOKEN_ACCESS_TIME` when no tier is given). Returns `0` if the env var is unset.
- **`getExpiryTimeMilliseconds(remember?)`** — same as above, multiplied by 1000.
- **`getAccessTokenSecret()`** — reads `NODE_TOKEN_ACCESS` from `process.env` (empty-string fallback).
- **`getRefreshTokenSecret()`** — reads `NODE_TOKEN_REFRESH` from `process.env` (empty-string fallback).
- **`getAccessTokenTTL()`** — shorthand for the default access-token lifetime in seconds (`NODE_TOKEN_ACCESS_TIME`).

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — sole import; provides `environmentNumber` which every duration read in this file delegates to.
- **`src/modules/account/session/jwt.ts`** — consumes `getAccessTokenSecret`, `getRefreshTokenSecret`, and `getAccessTokenTTL` to sign/verify JWTs.
- **`src/modules/account/session/cookies.ts`** — consumes `getExpiryTimeMilliseconds` to set the `maxAge` on refresh-token cookies.
- **`src/modules/account/controllers/post-login.ts`** — orchestrates the session flow that ultimately calls the above two modules.
- **Tests** (`tokens.test.ts`, `cookies.test.ts`, `jwt.test.ts`) — exercise the exported helpers directly or indirectly to verify expiry values, secret retrieval, and cookie/JWT wiring.

## Notes

- All duration helpers return **0** (not a thrown error) when the corresponding env var is absent; callers must guard against zero-length tokens.
- `getAccessTokenSecret` / `getRefreshTokenSecret` use `process.env` directly rather than `environmentNumber`, because they are strings—don't assume every export goes through the `environment` helper.
- The file deliberately avoids the name `tokens.ts` (already used at the module root for actual token creation) to prevent import ambiguity.
