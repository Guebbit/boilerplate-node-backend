---
source: src/modules/account/session/config.ts
generated_at: 2026-11-22T03:45:30.686891+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/config.ts

## Purpose
Declares the account-sessions configuration: which session mode is used (`jwt` or `cookie`), how long each session tier lives, the signing/encryption secrets, and the refresh-token rotation windows. It holds policy only — it issues and stores no tokens. Other session files read from it (signing, cookie storage, cookie `maxAge`).

## Key elements
- **`sessionConfig`** — the `defineConfig` schema named `account-sessions`. Fields:
  - Shared by both modes: `NODE_SESSION_MODE` (default `jwt`) and the three `NODE_SESSION_TIME_*` tiers (`SHORT`, `MEDIUM`, `LONG`; defaults 1 day / 7 days / 30 days, in seconds, min 1).
  - Staff-only: `NODE_SESSION_IDLE_TIME_STAFF` (default 1800s) and `NODE_SESSION_LIFETIME_STAFF` (default 86400s). `0` disables either.
  - `jwt`-oriented: `NODE_TOKEN_ACCESS_TIME` (default 600s), `NODE_TOKEN_ACCESS` and `NODE_TOKEN_REFRESH` key rings, `NODE_TOKEN_ISSUER`, `NODE_TOKEN_ACCESS_AUDIENCE`, `NODE_TOKEN_REFRESH_AUDIENCE`, `NODE_TOKEN_ROTATION_GRACE_MS` (default 10s) and `NODE_TOKEN_REUSE_WINDOW_MS` (default `DAY_MS`).
  - Always required: `NODE_TOTP_ENCRYPTION_KEY` (versioned key ring) and `NODE_DEVICE_COOKIE_SECRET` (a `secret`, `productionOnly`).
  - A `check` that fails boot if, outside `cookie` mode, the reuse window does not exceed the rotation grace.
- **`getSessionMode()`** — returns the configured mode, read on each call.
- **`getExpiryTime(remember?)` / `getExpiryTimeMilliseconds(remember?)`** — server-side session lifetime for a `RememberTier`; no tier falls back to `short`.
- **`getCookieMaxAgeMilliseconds(remember?)`** — the cookie's `maxAge`, or `undefined` (browser-session cookie) when no tier is ticked.
- **`getStaffIdleTimeSeconds()` / `getStaffLifetimeSeconds()`** — the staff idle timeout and absolute lifetime cap.
- **`getAccessExpiryTime()`** — access-token lifetime, kept separate from the refresh-tier TTLs.
- **`getAccessTokenRing()` / `getRefreshTokenRing()`** — signing rings, newest first.
- **`getTokenIssuer()`, `getAccessTokenAudience()`, `getRefreshTokenAudience()`** — use the configured value, else derive from `NODE_URL` (the refresh audience appends `/account/refresh`).
- **`getTotpEncryptionKeyRing()`** — the versioned key ring protecting second-factor material.
- **`getRotationGraceMilliseconds()`** — how long a just-rotated refresh token is still honoured.
- The file continues past this point with further accessors, including one for the reuse window.

## Relationships
- Built with `defineConfig` (`src/infrastructure/config/define.ts`) and the field builders `choice`, `int`, `keyRing`, `secret`, `text` and `versionedKeyRing` (`src/infrastructure/config/fields.ts`). It uses the `Environment` type from `src/infrastructure/config/store.ts` for the `skipWhen` predicate.
- Imports `DAY_MS` from `src/domain-primitives/time.ts`.
- Imports `SESSION_MODES` and `SessionMode` from `../session-mode`.
- Reads `siteConfig().NODE_URL` from `src/infrastructure/http/config.ts` to derive default issuer and audiences.
- Uses the `VersionedKey` type from `src/infrastructure/security/versioned-secret.ts`.
- Its own docs name `./jwt`, `./cookie-strategy` and `./cookies` as consumers; `jwt-strategy.ts` and `cookie-strategy.ts` are neighbors in the graph.
- Other neighbors (`device-cookie.ts`, `idle.ts`, `module.ts`, `get-refresh-token.ts`, `public-config.ts`, `reencrypt.ts`) depend on it. This is consistent with the staff idle/lifetime, device-cookie secret, TOTP ring and mode accessors, but the file content does not show how each uses it.

## Notes
- `NODE_TOKEN_ACCESS` and `NODE_TOKEN_REFRESH` use `skipWhen: selectsCookieMode`, so `cookie` deployments need not set them. `selectsCookieMode` reads the raw `NODE_SESSION_MODE`, trimmed and lower-cased.
- Each key-ring entry must meet `minLength: 16` and `minBytes: 32` and must not be the shipped placeholder. Because the rule applies to every comma-separated member, a rotated-in entry left as the placeholder also refuses to boot.
- `NODE_DEVICE_COOKIE_SECRET` unset on a dev machine means no device cookie is set or honoured. In production, unset or the placeholder refuses to boot.
- The TTL defaults and `min: 1` exist so an unset variable cannot give a TTL of zero. The staff limits use `min: 0` to allow switching off.
- The reuse-window check runs at boot because its failure is silent: everything works, but replays just return 401 and reuse detection is lost.
- The refresh audience differs from the access audience by default, so a token of one kind is refused as the other.
- `TOKEN_EXPIRY` uses `satisfies Record<RememberTier, string>`, so adding a tier to the contract is a compile error here until it is mapped.
- Accessors call `sessionConfig()` on each use rather than caching.
