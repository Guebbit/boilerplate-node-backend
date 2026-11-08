---
source: src/modules/account/session/config.ts
sha256: 709fdabaf29c82288fc851bb368e2e447d4e629ec8a49e1901fa0e1579d0ea11
generated_at: 2026-11-08T04:26:48.293697+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/config.ts

## Purpose

Declares and validates the full set of session-related environment variables (mode selector, per-tier TTLs, signing key rings, TOTP encryption ring, device-cookie HMAC secret, issuer/audience, rotation windows) in a single `defineConfig` block, then exposes a battery of typed getter functions that the JWT and cookie strategies read at runtime. It holds no token and issues none; it is the single source of truth for *how long* and *with what key* a session lives.

## Key elements

- **`sessionConfig`** — The `defineConfig` instance named `account-sessions`. Contains all fields, their defaults, presence/required rules, and a boot-time `check` that enforces `REUSE_WINDOW > ROTATION_GRACE` in JWT mode.
- **`selectsCookieMode`** (internal) — Predicate that trims/lower-cases `NODE_SESSION_MODE` and returns `true` for `"cookie"`; used by `skipWhen` so key-ring fields are optional in cookie deployments.
- **`TOKEN_EXPIRY`** (internal) — Maps `RememberTier` → env-var key, satisfying `Record<RememberTier, string>` so a new tier is a compile error.
- **`getSessionMode()`** — Returns the resolved `SessionMode` (`'jwt'` | `'cookie'`), read per call.
- **`getExpiryTime(remember?)`** — Server-side session lifetime in seconds (short/medium/long tier; defaults to short when no tier).
- **`getExpiryTimeMilliseconds(remember?)`** — Millisecond wrapper around the above.
- **`getStaffIdleTimeSeconds()`** / **`getStaffLifetimeSeconds()`** — Staff/admin inactivity and absolute-lifetime caps (0 disables).
- **`getAccessExpiryTime()`** — Access-token lifetime in seconds (default 600); intentionally independent of the session tier.
- **`getCookieMaxAgeMilliseconds(remember?)`** — `maxAge` for the session cookie, or `undefined` for a browser-session cookie.
- **`getAccessTokenRing()`** / **`getRefreshTokenRing()`** — Ordered (newest-first) signing/verification key rings.
- **`getTokenIssuer()`** / **`getAccessTokenAudience()`** / **`getRefreshTokenAudience()`** — `iss` and `aud` claims; derive from `NODE_URL` when the dedicated vars are unset. Refresh audience defaults to `NODE_URL/account/refresh` to keep the two token types distinct.
- **`getTotpEncryptionKeyRing()`** — `VersionedKey[]` ring protecting 2FA material; versioned entries enable per-row decryption during rotation.
- **`getRotationGraceMilliseconds()`** — Window after rotation during which the old refresh token is still honoured (default 10 s).
- **`getReuseWindowMilliseconds()`** (truncated in source) — How long a rotated-away token is remembered for replay detection (default 1 day).

## Relationships

- **`session-mode.ts`** — Provides `SESSION_MODES` (allowed values) and the `SessionMode` type consumed by the `choice` field and `getSessionMode`.
- **`infrastructure/config/define.ts`** — Supplies `defineConfig`, the builder that validates fields at boot and enforces the `check` predicate.
- **`infrastructure/config/fields.ts`** — Supplies all field constructors (`choice`, `int`, `keyRing`, `secret`, `text`, `versionedKeyRing`) used to declare the shape.
- **`infrastructure/config/store.ts`** — Provides the `Environment` type read by `selectsCookieMode` (the `skipWhen` predicate).
- **`infrastructure/http/config.ts`** — Provides `siteConfig` whose `NODE_URL` seeds the issuer/audience fallbacks via the internal `ownUrl()` helper.
- **`infrastructure/security/versioned-secret.ts`** — Provides the `VersionedKey` type returned by `getTotpEncryptionKeyRing`.
- **`domain-primitives/time.ts`** — Imports `DAY_MS` as the default for `NODE_TOKEN_REUSE_WINDOW_MS`.
- **`jwt-strategy.ts`** — Consumes the access/refresh rings, issuer, audiences, access expiry, rotation grace, and reuse window to sign and verify tokens.
- **`cookie-strategy.ts`** — Consumes `getExpiryTime`, `getCookieMaxAgeMilliseconds`, and `getStaffIdleTimeSeconds` / `getStaffLifetimeSeconds` to set cookie lifetimes and enforce staff caps.
- **`idle.ts`** — Reads the staff idle/lifetime seconds to implement the inactivity and absolute-lifetime timers.
- **`device-cookie.ts`** — Reads `NODE_DEVICE_COOKIE_SECRET` to HMAC the familiar-device cookie.
- **`get-refresh-token.ts`** (controller) — Calls `getRefreshTokenRing`, `getRotationGraceMilliseconds`, and `getReuseWindowMilliseconds` during rotation and replay checks.
- **`reencrypt.ts`** — Uses `getTotpEncryptionKeyRing` to re-encrypt 2FA secrets under a newer ring entry.
- **`public-config.ts`** — Reads session config to expose non-secret values (mode, tiers) to the client.
- **`module.ts`** — Wires the session sub-module, registering strategies and controllers that depend on this config.

## Notes

- The two signing rings (`NODE_TOKEN_ACCESS`, `NODE_TOKEN_REFRESH`) and the TOTP key ring all share a `minLength: 16` / `minBytes: 32` floor and a recognisable placeholder string; a boot with the placeholder still in place fails.
- `skipWhen: selectsCookieMode` means the access/refresh rings are **not required** in cookie mode — a cookie deployment signs nothing.
- The boot-time `check` is a silent-failure guard: if the reuse window ≤ grace window in JWT mode, replay detection is impossible but every request would still "work" (clean 401). The check turns that into a loud boot error.
- `NODE_SESSION_IDLE_TIME_STAFF` and `NODE_SESSION_LIFETIME_STAFF` accept `0` to disable; they apply only to staff/admin sessions, never to shopper sessions.
- The TOTP ring is **versioned** (`VersionedKey[]`), unlike the JWT rings (`string[]`), because ciphertext rows must remain decryptable after a key rotation.
- All TTL fields default to non-zero values so that an unset variable never yields a TTL of 0 (instant expiry).
- `getExpiryTime` defaults to the **short** tier when `remember` is absent, because a browser-session cookie can be restored by the browser and still needs a server-side bound.
