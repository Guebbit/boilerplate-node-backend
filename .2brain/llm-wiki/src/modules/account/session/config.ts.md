---
source: src/modules/account/session/config.ts
sha256: bd9476fda59507eceb36751966852a70346f121522d63653ba8ff886a0c64d9a
generated_at: 2026-10-14T08:58:30.185286+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/config.ts

## Purpose

Declares the environment-driven session policy for the account module: which mode is active (`jwt` or `cookie`), the TTL for each "remember me" tier, the JWT signing key rings, the TOTP encryption ring, the device-cookie HMAC secret, and the two rotation windows. It holds no tokens and issues none — it reads config that `./jwt-strategy` signs against, `./cookie-strategy` stores against, and `./device-cookie` sets `maxAge` from.

## Key elements

- **`RefreshTokenExpiryTime`** — enum with three tiers: `SHORT`, `MEDIUM`, `LONG`.
- **`toRememberTier(wire?)`** — maps a wire literal (`'short' | 'medium' | 'long'` or `undefined`) to the enum; returns `undefined` when the "remember me" box was unticked.
- **`sessionConfig`** — the `defineConfig` block (`account-sessions`). Contains all env vars, their types/defaults, boot-time presence rules, and a cross-field `check` enforcing `REUSE_WINDOW_MS > GRACE_MS` (skipped in cookie mode).
- **`getSessionMode()`** — returns the active `SessionMode` (`'jwt'` or `'cookie'`).
- **`getExpiryTime(remember?)`** — session lifetime in seconds for a tier; falls back to `SHORT` when no tier is given.
- **`getExpiryTimeMilliseconds(remember?)`** — same, in ms.
- **`getAccessExpiryTime()`** — access-token lifetime in seconds (deliberately independent of the session tier).
- **`getCookieMaxAgeMilliseconds(remember?)`** — `Max-Age` in ms for a persistent session cookie; `undefined` for a browser-session cookie.
- **`getAccessTokenRing()` / `getRefreshTokenRing()`** — ordered key rings (newest first) for JWT signing/verification.
- **`getTotpEncryptionKeyRing()`** — returns `VersionedKey[]`; entries carry a version prefix so ciphertexts can be decrypted under the key that encrypted them.
- **`getRotationGraceMilliseconds()`** — how long a just-rotated refresh token is still honoured (default 10 s).
- **`getReuseDetectionWindowMilliseconds()`** — how long a rotated-away token is remembered for replay detection (default 24 h).

## Relationships

- **`../session-mode.ts`** — supplies the `SESSION_MODES` array and `SessionMode` type consumed by `choice(SESSION_MODES, …)` and `getSessionMode()`.
- **`@infrastructure/config/define.ts`** — provides `defineConfig`, the declarative config builder used for `sessionConfig`.
- **`@infrastructure/config/fields.ts`** — provides `choice`, `int`, `keyRing`, `secret`, `versionedKeyRing` field constructors.
- **`@infrastructure/config/store.ts`** — provides the `Environment` type used by the internal `selectsCookieMode` predicate.
- **`@infrastructure/security/versioned-secret.ts`** — provides the `VersionedKey` return type of `getTotpEncryptionKeyRing`.
- **`./jwt-strategy.ts`** — signs with `ring[0]` of `getAccessTokenRing`/`getRefreshTokenRing` and verifies against the member named by `kid`; reads `getAccessExpiryTime` and `getExpiryTime` for token lifetimes.
- **`./cookie-strategy.ts`** — stores session rows whose lifetime comes from `getExpiryTime`.
- **`./device-cookie.ts`** — uses `NODE_DEVICE_COOKIE_SECRET` (via the config store) to HMAC the familiar-device cookie; unset on dev means the cookie is never set.
- **`../services/reencrypt.ts`** — calls `getTotpEncryptionKeyRing` to re-encrypt 2FA material under a rotated key.
- **`../services/sessions.ts`** — reads tier TTLs and mode to manage session rows.
- **`../controllers/post-login.ts`** — calls `getExpiryTime`, `getCookieMaxAgeMilliseconds`, `getAccessTokenRing`, etc. to issue the login response.
- **`../controllers/post-login-2fa.ts`** — consumes the TOTP encryption ring and session tiers during 2FA login.
- **`../controllers/get-refresh-token.ts`** — reads `getRotationGraceMilliseconds` and `getReuseDetectionWindowMilliseconds` during token rotation.
- **`../controllers/get-session-config.ts`** — exposes the relevant subset of `sessionConfig` to the client.
- **`../module.ts`** — registers this module in the account module's dependency graph.

## Notes

- **Access vs. session TTL are separate.** `getAccessExpiryTime` must never be conflated with `getExpiryTime`; an access token is short-lived regardless of the "remember me" tier.
- **Zero-TTL guard.** Every TTL field has a `default` and `min: 1` so an unset variable can never produce a token that expires instantly.
- **Boot check is silent-failure prevention.** The `check` callback enforces `REUSE_WINDOW_MS > GRACE_MS` at boot; without it, a misconfigured pair would let every replayed token answer a clean 401 with the defence silently absent. The check is skipped in cookie mode.
- **`skipWhen: selectsCookieMode`.** The two JWT signing rings are not required at boot in a cookie-mode deployment.
- **Key-ring min length is 16 chars / 32 bytes** — a floor to reject empty or placeholder values, not a claim of cryptographic strength.
- **Reuse window default (24 h) is capacity-bounded.** An active client rotates ~every 600 s, so 24 h ≈ 144 retained entries per session; a full 1-year tier would hit ~52 500 entries, approaching Mongo's 16 MB document ceiling.
- **`NODE_DEVICE_COOKIE_SECRET` is `productionOnly`.** Unset on a dev machine is valid (no cookie is set); unset or placeholder in production refuses to boot.
- **`getTotpEncryptionKeyRing` returns `VersionedKey[]`, not `string[]`.** Each entry carries a version so the 2FA module can decrypt old rows under the correct key without a bulk migration.
