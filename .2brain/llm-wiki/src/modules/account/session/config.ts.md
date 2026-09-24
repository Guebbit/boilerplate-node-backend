---
source: src/modules/account/session/config.ts
sha256: 85a6b3cf7a324a5bd2bded5e3bb8d611185bb45dbe96dfd71e87cc5477dc1681
generated_at: 2026-09-23T18:10:57.167276+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/config.ts

## Purpose

Centralises all token-related environment-variable reads into named, typed accessors. It holds no token and issues none; it simply resolves how long each expiry tier lives, which key rings are active, and what the rotation/reuse detection windows are. Every other session file imports from here rather than touching `process.env` directly, so there is exactly one place to look for a token setting.

## Key elements

- **`RefreshTokenExpiryTime`** — enum (`SHORT` | `MEDIUM` | `LONG`) identifying the three "remember-me" tiers for refresh tokens.
- **`getExpiryTime(remember?)`** — returns the expiry in **seconds** for a tier, or the default access-token lifetime (600 s) when no tier is given. Reads via `environmentNumber` with a per-tier fallback.
- **`getExpiryTimeMilliseconds(remember?)`** — same value × 1000; used wherever a `maxAge` or TTL is expected in ms.
- **`getAccessTokenRing()`** — splits `NODE_TOKEN_ACCESS` on commas; newest key first. Consumed by `./jwt` for signing (`ring[0]`) and verification (by `kid`).
- **`getRefreshTokenRing()`** — same shape for `NODE_TOKEN_REFRESH`.
- **`getTotpEncryptionKeyRing()`** — parses `NODE_TOTP_ENCRYPTION_KEY` into `VersionedKey[]` via `parseVersionedKeyRing`; used by `two-factor/totp.ts` and `two-factor/delivered-codes.ts` to encrypt/decrypt stored 2FA material.
- **`getRotationGraceMilliseconds()`** — how long a just-rotated refresh token is still accepted (default 10 s). Covers benign same-page-load races.
- **`getReuseDetectionWindowMilliseconds()`** — how long a rotated-away refresh token stays "recognised as stolen" (default 24 h). Distinct from the grace window.
- **`invalidTokenWindows()`** — boot-time invariant check: reuse window must exceed grace window. Returns an array of human-readable error strings (empty when valid).

## Relationships

- **`infrastructure/runtime/environment.ts`** — provides `environmentNumber(key, fallback)` used by every numeric getter in this file.
- **`infrastructure/security/versioned-secret.ts`** — provides `parseVersionedKeyRing` and the `VersionedKey` type for `getTotpEncryptionKeyRing`.
- **`session/jwt.ts`** — calls `getAccessTokenRing` to sign/verify access tokens and `getExpiryTime` for the `exp` claim.
- **`session/cookies.ts`** — calls `getExpiryTimeMilliseconds` to set the `maxAge` on session cookies.
- **`session/session.ts`** — consumes expiry and ring values when issuing/rotating refresh tokens.
- **`controllers/post-login.ts`** — reads the tier chosen at login and passes it to the token-issuing path.
- **`module.ts`** — calls `invalidTokenWindows()` during manifest/boot validation to fail-fast on misordered windows.
- **`services/token-cleanup.ts`** — uses `getReuseDetectionWindowMilliseconds` to prune stale rotated-token entries.
- **`two-factor/totp.ts`** / **`two-factor/delivered-codes.ts`** — call `getTotpEncryptionKeyRing` to encrypt device secrets and HMAC delivered codes.
- **Tests** (`cookies.test.ts`, `tokens.test.ts`, `jwt.test.ts`, `api.contract.test.ts`) — exercise the exported getters to confirm env-var parsing and fallback behaviour.

## Notes

- The name is `config.ts` deliberately (not `tokens.ts`) to signal that it *reads* settings and never touches token material.
- `TOKEN_EXPIRY` is a **private** constant; consumers should go through the exported getters so the fallback logic lives in one place.
- `invalidTokenWindows` is checked **at boot**, not per-request, because a silent misconfiguration (all replays return a clean 401) is the exact failure it guards against.
- Key rings are ordered newest-first; `ring[0]` is always the current signing key. A single-entry ring is just the raw value with no comma.
- The TOTP ring entries are **versioned** (`VersionedKey[]`), unlike the JWT rings (plain `string[]`), so that ciphertexts can be decrypted against whichever key was active when they were written.
