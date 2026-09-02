# src/modules/account/session/config.ts

## Purpose

Centralized read-only accessor for all token-related environment variables (expiry durations, signing secrets, TOTP encryption key, rotation grace period). It holds no tokens and issues none — it merely parses env vars into typed values that `./jwt` signs against, `./cookies` reads for `maxAge`, and `two-factor.ts` uses for at-rest encryption.

## Key elements

- **`RefreshTokenExpiryTime`** (enum) — the three "remember me" tiers: `SHORT`, `MEDIUM`, `LONG`.
- **`TOKEN_EXPIRY_ENV`** (internal const) — maps each tier (plus `'default'`) to its `NODE_TOKEN_*` env var name.
- **`getExpiryTime(remember?)`** — returns expiry in **seconds** for the given tier; falls back to `NODE_TOKEN_ACCESS_TIME`. Returns `0` if the env var is unset.
- **`getExpiryTimeMilliseconds(remember?)`** — thin `* 1000` wrapper around `getExpiryTime`.
- **`getAccessTokenSecret()`** — `process.env.NODE_TOKEN_ACCESS` (empty string if unset).
- **`getRefreshTokenSecret()`** — `process.env.NODE_TOKEN_REFRESH` (empty string if unset).
- **`getAccessTokenTTL()`** — `NODE_TOKEN_ACCESS_TIME` in seconds; `0` if unset.
- **`getTotpEncryptionKey()`** — returns `{ version: 'v1', key }` for encrypting TOTP secrets at rest.
- **`getRotationGraceMilliseconds()`** — `NODE_TOKEN_ROTATION_GRACE_MS` (default 10 000). Milliseconds, compared against a `Date` delta; never embedded in a token.

## Relationships

- **`src/infrastructure/runtime/environment.ts`** — source of the `environmentNumber` helper used to parse every duration env var in this file.
- **`src/modules/account/session/jwt.ts`** — consumes the secrets, TTLs, and tier expiries here to sign/verify access and refresh tokens.
- **`src/modules/account/session/cookies.ts`** — calls `getExpiryTimeMilliseconds` to set cookie `maxAge`.
- **`src/modules/account/two-factor.ts`** — reads `getTotpEncryptionKey` and prefixes each ciphertext with the returned `version` to support future key rotation.
- **`src/modules/account/services/token-cleanup.ts`** — uses the expiry values to determine token lifetime during cleanup sweeps.
- **`src/modules/account/controllers/post-login.ts`** — requests the relevant tier/secret when issuing tokens after a successful login.
- **`src/modules/account/tests/unit/tokens.test.ts`, `…/unit/cookies.test.ts`, `…/integration/jwt.test.ts`** — exercise the getters and verify the downstream signing/cookie behavior they configure.

## Notes

- Named `config.ts` (not `tokens.ts`) specifically to signal "read-only env parsing, no token logic." The module root has a separate `tokens.ts`.
- All duration getters return **seconds** except `getExpiryTimeMilliseconds` and `getRotationGraceMilliseconds`, which return **milliseconds**. Callers must not mix units.
- Secret getters return `''` (empty string) rather than `undefined`/`null` when the env var is missing — downstream code that signs with an empty string will produce a valid-but-predictable JWT. There is no guard here.
- `getTotpEncryptionKey` is the only export that returns an object rather than a scalar. The `version` field is load-bearing: `two-factor.ts` writes it into the ciphertext so decryption can select the correct key during rotation.
- `getRotationGraceMilliseconds` has a hardcoded fallback of 10 s; every other duration falls back to `0`, meaning "invalid / disabled."
