---
source: src/modules/account/session/jwt.ts
sha256: 4b737d725957861c8d9c1ce4d1d8d73501ae7fc1464a5115bd4dd7e2d11631bc
generated_at: 2026-10-15T10:07:42.987775+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/jwt.ts

## Purpose

Creates and verifies the application's access and refresh JWTs (HS256, built on `jose`). Policy (secrets, TTLs, audiences, issuer) is owned by `./config`; this file is the signing and verification logic itself. It was app-level middleware until the domain split made it part of the `account` module, since issuing/verifying tokens is what `account` does.

## Key elements

- **`TokenData`** (interface) — the app-specific claims stamped into every token: `sub`, `auth_time`, `amr`, optional `remember`, optional `sid`, optional `client_id`.
- **`AccessTokenData`** (type) — `TokenData` with `sid` required.
- **`FIRST_PARTY_CLIENT_ID`** — constant `'first-party'`; the sole `client_id` value (no client registry exists).
- **`RotatedSession`** (interface) — `{ accessToken, refreshToken, refreshMaxAgeMs }` handed to the controller after rotation.
- **`TokenRejection`** (class extends `Error`) — carries a `ResolveMissReason` so the kernel's resolver can distinguish actionable rejections from outages/bugs.
- **`verifyAccessToken(token)`** — stateless verification against the access ring; returns `AccessTokenData`.
- **`verifyRefreshWithRow(token)`** — verification against the refresh ring **plus** a DB lookup via `sessionRepository.findByHash(hashToken(token))` to confirm the row is live; returns `{ data, row }`.
- **`carriedClaims`** (internal) — picks only `sub`, `auth_time`, `amr`, and `remember` (if set) to copy forward across mints/rotations.
- **`verifyAgainstRing`** (internal) — single `jwtVerify` call pinned to HS256, the kind's `typ`, `iss`, `aud`, and `requiredClaims`; then shape-checks via `carriesTokenClaims`.
- **`rejectionOf`** (internal) — maps `jose` error types to `TokenRejection` reasons (`expired`, `invalid_signature`, `malformed`).
- **`ringKeyLookup`** (internal) — resolves a `kid` against a ring via `keyForId`; throws `TokenRejection('invalid_signature')` for unknown keys.
- **`TOKEN_TYPE_HEADER`** / **`AUDIENCE_OF`** / **`REQUIRED_CLAIMS`** — per-kind (`access` | `refresh`) verification constraints that cross-reject tokens of the wrong kind.

## Relationships

- **`./config`** — all TTL, audience, issuer, ring, grace-period, and reuse-window values are read from the config getters at call time (no module-level caching of secrets).
- **`./key-ring`** — `keyId` / `keyForId` resolve a token's `kid` to an HMAC secret within the ordered ring.
- **`./epoch`** — `predatesSessionEpoch` is imported (used in the truncated signing/rotation section).
- **`./activity`** — `recordActivity` is called when a token is verified (activity tracking).
- **`./mint-guard`** — `assertProofCurrent` / `assertSecondFactor` gate minting operations (used in the truncated section).
- **`../repository`** — `sessionRepository.findByHash` performs the DB revocation/supersession check for refresh tokens; `SessionRow` is the returned type.
- **`../services/revocation`** — `revokeFor` is called when a token is rejected (e.g., reuse detection).
- **`@infrastructure/security/hash-token`** — `hashToken` hashes the raw refresh token before the DB lookup.
- **`@kernel/authentication`** — `ResolveMissReason` type shapes the `TokenRejection.reason` field.
- **`./strategy`** — `SessionSnapshot` type imported (used in the truncated section).
- **Tests** — covered by `tests/integration/jwt.test.ts`, `revocation-causes.test.ts`, and `service-flows.test.ts`.

## Notes

- The file is truncated in the snapshot; the signing/minting and rotation paths (which consume `mint-guard`, `epoch`, `activity`, `revokeFor`) live below the cut.
- `auth_time` and `amr` are **copied forward** from the original login on every mint/rotation — they are never re-stamped from the clock.
- `remember` is **omitted** (not set to `undefined`) in the payload when the user did not tick "remember me"; `carriedClaims` spreads it conditionally.
- `sid` exists **only** on access tokens; refresh tokens are the session credential itself.
- The `typ` header (`at+jwt` / `rt+jwt`) plus distinct `aud` values cross-reject a token presented as the wrong kind, even if both rings share a secret.
- `rejectionOf` passes through non-`jose` errors unchanged (outage, bug) so the caller can distinguish them from a `TokenRejection`.
- `verifyRefreshWithRow` rejects a superseded (rotated-away) token at the credential level, but the rotation endpoint itself still reads that row for reuse detection and the two-tab grace window.
