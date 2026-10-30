---
source: src/modules/account/session/config.ts
sha256: 709fdabaf29c82288fc851bb368e2e447d4e629ec8a49e1901fa0e1579d0ea11
generated_at: 2026-10-29T02:47:23.099625+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/config.ts

## Purpose

Declares the full session-policy surface (mode, TTL tiers, signing rings, rotation windows, issuer/audience, staff timeouts, device-cookie secret, TOTP encryption key) as a single typed config object, then exposes narrow getter functions so consumers never touch raw env vars directly. It is policy, not tokens: it defines *what* `jwt-strategy` signs against, what `cookie-strategy` stores against, and what `device-cookie` HMACs against.

## Key elements

- **`sessionConfig`** — the `defineConfig` declaration (`name: 'account-sessions'`). Holds every `NODE_SESSION_*` / `NODE_TOKEN_*` field with defaults, validation, and a boot-time `check` asserting `REUSE_WINDOW_MS > ROTATION_GRACE_MS` in `jwt` mode.
- **`selectsCookieMode`** — private helper; trims/lower-cases `NODE_SESSION_MODE` so `keyRing` fields can skip their `required` rule in a `cookie` deployment.
- **`TOKEN_EXPIRY`** — maps `RememberTier` → env-var key, `satisfies Record<RememberTier, string>` for exhaustiveness.
- **`getSessionMode`** — returns the active `SessionMode` per call (test/restart friendly).
- **`getExpiryTime` / `getExpiryTimeMilliseconds`** — seconds (or ms) server-side lifetime for a tier; defaults to `short` when no tier is chosen.
- **`getStaffIdleTimeSeconds` / `getStaffLifetimeSeconds`** — staff-only idle and absolute-lifetime caps (`0` = off).
- **`getAccessExpiryTime`** — access-token lifetime in seconds (default 600 s), deliberately independent of the session tier.
- **`getCookieMaxAgeMilliseconds`** — `maxAge` for the session cookie, or `undefined` for a browser-session cookie.
- **`getAccessTokenRing` / `getRefreshTokenRing`** — ordered string arrays (newest first) for JWT signing/verification.
- **`getTokenIssuer` / `getAccessTokenAudience` / `getRefreshTokenAudience`** — `iss`/`aud` values; fall back to `NODE_URL` (derived via `siteConfig`) when unset. Refresh audience defaults to `NODE_URL + '/account/refresh'` to distinguish token kinds.
- **`getTotpEncryptionKeyRing`** — `VersionedKey[]` protecting two-factor material; versioned so old ciphertexts decrypt under their original key.
- **`getRotationGraceMilliseconds`** — window in which a just-rotated refresh token is still accepted (default 10 s).
- **`getReuseWindowMilliseconds`** (truncated in source) — window in which a rotated-away token is *recognised* as a replay (default 1 day / `DAY_MS`).

## Relationships

- **`@infrastructure/config/define`** — `defineConfig` is the function that produces the typed `sessionConfig` object with its `shape` and `check`.
- **`@infrastructure/config/fields`** — supplies `choice`, `int`, `keyRing`, `secret`, `text`, `versionedKeyRing` field constructors used in the shape.
- **`@infrastructure/config/store`** — `Environment` type parameterises `selectsCookieMode`.
- **`@infrastructure/http/config`** — `siteConfig().NODE_URL` is the fallback source for issuer and both audiences.
- **`@infrastructure/security/versioned-secret`** — `VersionedKey` type for the TOTP ring entries.
- **`@domain-primitives/time`** — `DAY_MS` is the default for `NODE_TOKEN_REUSE_WINDOW_MS`.
- **`../session-mode`** — `SESSION_MODES` (enum values for `choice`) and the `SessionMode` type.
- **`session/jwt-strategy.ts`** — consumes the token rings, issuer, audiences, access expiry, and rotation/reuse windows to sign and verify JWTs.
- **`session/cookie-strategy.ts`** — consumes `getExpiryTime*` and `getCookieMaxAgeMilliseconds` to set the session row and cookie.
- **`session/device-cookie.ts`** — consumes `NODE_DEVICE_COOKIE_SECRET` for HMAC of the familiar-device cookie.
- **`session/idle.ts`** — consumes the staff idle/lifetime getters to enforce inactivity and absolute caps.
- **`controllers/get-session-config.ts`** — likely calls `getSessionMode` / `getExpiryTime` to shape the API response.
- **`controllers/get-refresh-token.ts`** — consumes rotation grace, reuse window, and refresh ring to implement rotation + replay detection.
- **`services/reencrypt.ts`** — consumes `getTotpEncryptionKeyRing` to re-encrypt two-factor ciphertexts under a new key version.

## Notes

- The config is **not** a token issuer; it never mints or signs anything. The file name is `config.ts` (not `tokens.ts`) for exactly that reason.
- `NODE_TOKEN_ACCESS` and `NODE_TOKEN_REFRESH` are **skipped** in `cookie` mode via `skipWhen: selectsCookieMode`; a cookie-only deployment can boot without them.
- The `check` function enforces `REUSE_WINDOW_MS > ROTATION_GRACE_MS` **only** in `jwt` mode; in `cookie` mode the constraint is vacuously satisfied.
- `getExpiryTime` defaults to the `short` tier when `remember` is absent — browsers restore session cookies, so the server TTL is the real bound even for "browser-session" logins.
- Key-ring fields require **all** comma-separated members to pass `minLength`/`minBytes`; a placeholder left as the second entry still blocks boot.
- `NODE_DEVICE_COOKIE_SECRET` is `productionOnly: true` — unset on a dev machine simply means no device cookie is set or honoured.
- Access and refresh audiences differ by default (`/account/refresh` suffix on refresh) so a token of one kind is rejected as the other even under a shared secret.
