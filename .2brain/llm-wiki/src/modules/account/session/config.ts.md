---
source: src/modules/account/session/config.ts
sha256: 7648e5f5408121280e64278101558f8ce4f5779f6f0d263a9eef01f27cf2ca64
generated_at: 2026-10-15T10:05:33.093533+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/config.ts

## Purpose

Declares the session policy for the account module: which mode (`jwt` or `cookie`) is active, how long each "remember me" tier lives, the signing key rings, the rotation/reuse windows, and the issuer/audience defaults. It holds no tokens and issues none — downstream modules (`./jwt`, `./cookie-strategy`, `./cookies`) read its values to sign, store, or set `maxAge`. Named `config.ts` (not `tokens.ts`) to make that separation explicit.

## Key elements

- **`RefreshTokenExpiryTime`** (enum) — the three "remember me" tiers: `SHORT`, `MEDIUM`, `LONG`.
- **`toRememberTier(wire?)`** — narrows the request-body literal to the enum; returns `undefined` when the box was unticked.
- **`sessionConfig`** — the `defineConfig` block. Declares every `NODE_SESSION_*`, `NODE_TOKEN_*`, `NODE_TOTP_*`, and `NODE_DEVICE_COOKIE_*` variable with validators and defaults. Includes a boot-time `check` that asserts `REUSE_WINDOW_MS > ROTATION_GRACE_MS` (moot in cookie mode).
- **`getSessionMode()`** — returns the current `SessionMode` per call (so tests/restarts can flip it).
- **`getExpiryTime(remember?)` / `getExpiryTimeMilliseconds(remember?)`** — server-side TTL in seconds/milliseconds; falls back to the `SHORT` tier when no tier is given.
- **`getStaffIdleTimeSeconds()`** — staff inactivity timeout (0 = off); shoppers have no idle limit.
- **`getAccessExpiryTime()`** — access-token lifetime (default 600 s), deliberately independent of the session tier.
- **`getCookieMaxAgeMilliseconds(remember?)`** — `maxAge` for a persistent cookie, or `undefined` for a browser-session cookie.
- **`getAccessTokenRing()` / `getRefreshTokenRing()`** — ordered (newest-first) signing/verification key rings.
- **`getTokenIssuer()` / `getAccessTokenAudience()` / `getRefreshTokenAudience()`** — JWT `iss` and `aud` values; default from `NODE_URL` (refresh audience appends `/account/refresh`).
- **`getTotpEncryptionKeyRing()`** — versioned key ring protecting 2FA material; supports rotation without a one-time migration.
- **`getRotationGraceMilliseconds()` / `getReuseWindowMilliseconds()`** — the two windows around refresh-token rotation.

## Relationships

- **`src/infrastructure/config/define.ts`** — provides `defineConfig`, the DSL used to declare `sessionConfig`.
- **`src/infrastructure/config/fields.ts`** — provides the field validators (`choice`, `int`, `keyRing`, `secret`, `text`, `versionedKeyRing`).
- **`src/infrastructure/config/store.ts`** — provides the `Environment` type consumed by `selectsCookieMode`.
- **`src/infrastructure/http/config.ts`** — provides `siteConfig` (`NODE_URL`) from which issuer/audience defaults are derived.
- **`src/infrastructure/security/versioned-secret.ts`** — provides the `VersionedKey` type returned by `getTotpEncryptionKeyRing`.
- **`src/modules/account/session-mode.ts`** — provides `SESSION_MODES` and the `SessionMode` type used throughout.
- **`src/modules/account/session/cookie-strategy.ts`** — stores session rows using the TTLs and mode read from this file.
- **`src/modules/account/session/idle.ts`** — enforces the staff idle timeout via `getStaffIdleTimeSeconds`.
- **`src/modules/account/session/device-cookie.ts`** — HMACs the familiar-device cookie with `NODE_DEVICE_COOKIE_SECRET`.
- **`src/modules/account/controllers/post-login.ts`** — calls `toRememberTier`, `getExpiryTime`, ring getters, and audience getters to issue tokens/cookies.
- **`src/modules/account/controllers/get-refresh-token.ts`** — consumes rotation-grace and reuse-window getters during rotation.
- **`src/modules/account/services/reencrypt.ts`** — uses `getTotpEncryptionKeyRing` to re-encrypt 2FA material across key rotations.

## Notes

- The `skipWhen: selectsCookieMode` on both JWT rings means a cookie-mode deployment can boot without setting them; a jwt-mode deployment that leaves a ring member as the placeholder **refuses to boot**.
- All TTL variables have a `default` and `min: 1` so an unset variable never yields a zero-TTL that would expire tokens instantly.
- The 16-character minimum on key rings is intentionally a liveness check, not a strength assessment.
- `NODE_DEVICE_COOKIE_SECRET` is `productionOnly`; on a dev machine, unset simply means no device cookie is set or honoured.
- The access and refresh audiences are distinct by design (RFC 8725 §3.10), so a token of one kind is rejected as the other even if both rings shared a secret.
- The TOTP encryption key ring is **versioned** (unlike the JWT rings): each ciphertext records which ring entry encrypted it, enabling rotation without a data migration.
- The boot-time `check` exists because the reuse-window ≤ grace-window failure is silent — every replay would just get a clean 401 with no log distinguishing it from normal expiry.
