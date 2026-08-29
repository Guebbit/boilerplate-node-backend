# src/modules/account/session/config.ts

## Purpose

Centralises all token-related environment settings (expiry durations and signing secrets) in one place. It holds no token and issues none — it simply reads the deployment's "how long does a session last" values so that `./jwt` can sign against them and `./cookies` can derive `maxAge` from them.

## Key elements

- **`RefreshTokenExpiryTime`** (enum) — three refresh-token tiers: `SHORT`, `MEDIUM`, `LONG`.
- **`TOKEN_EXPIRY_ENV`** (module-private) — maps each tier (plus a `'default'` key) to its `NODE_TOKEN_REFRESH_TIME_*` / `NODE_TOKEN_ACCESS_TIME` env-var name.
- **`getExpiryTime(remember?)`** — returns the expiry for a tier in **seconds** (integer). Falls back to `NODE_TOKEN_ACCESS_TIME` when no tier is supplied. Returns `0` if the env var is unset.
- **`getExpiryTimeMilliseconds(remember?)`** — thin `* 1000` wrapper around `getExpiryTime`.
- **`getAccessTokenSecret()`** — returns `process.env.NODE_TOKEN_ACCESS` (empty string if unset).
- **`getRefreshTokenSecret()`** — returns `process.env.NODE_TOKEN_REFRESH` (empty string if unset).
- **`getAccessTokenTTL()`** — returns `NODE_TOKEN_ACCESS_TIME` as a number via `environmentNumber`, defaulting to `0`.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — imports `environmentNumber`, used by `getAccessTokenTTL`.
- **`src/modules/account/session/jwt.ts`** — consumes the secrets and TTLs exposed here to sign tokens (stated in this file's header comment).
- **`src/modules/account/session/cookies.ts`** — consumes the expiry values here to set `maxAge` on session cookies (stated in this file's header comment).
- **`src/modules/account/controllers/post-login.ts`** — downstream consumer; reaches these values transitively through `jwt.ts` / `cookies.ts` during the post-login flow.
- **Tests** (`jwt.test.ts`, `cookies.test.ts`, `tokens.test.ts`) — unit/integration tests that exercise the expiry and secret getters in this file.

## Notes

- Unset env vars resolve to **`0`** (seconds) or **`''`** (secrets), never `undefined`. Callers should guard against a zero TTL before calling `setTimeout` or `expiresAt` arithmetic.
- `getExpiryTime` reads `process.env` directly, whereas `getAccessTokenTTL` goes through `environmentNumber`. Both ultimately read the same variable (`NODE_TOKEN_ACCESS_TIME`); prefer one helper over the other to avoid divergence.
- The file was previously named `tokens.ts` at the module root; the rename to `config.ts` was intentional to signal "no token is held or issued here."
- `getExpiryTimeMilliseconds` is only used by consumers that need ms (e.g. cookie `maxAge`); JWT signing uses the seconds variant.
