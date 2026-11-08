---
source: src/modules/account/session/jwt.ts
sha256: a7b175b325f498d1a41f6bd523693a6d582dcb1c2e62cf387afe73c8d65d7769
generated_at: 2026-11-08T04:29:01.358849+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/jwt.ts

## Purpose

Creates and verifies the application's access and refresh JWTs on `jose`. All secrets, TTLs, issuer, and audience values are sourced from `./config`; this file owns only the signing/verification mechanics and the claim-shape contract. It is the core of what the `account` module does: turning a authenticated session into a bearer token and back.

## Key elements

- **`TokenData`** — The custom claims every token carries beyond registered ones: `sub`, `auth_time`, `amr`, optional `remember`, and (access-only) `sid` / `client_id`.
- **`AccessTokenData`** — `TokenData` with `sid` guaranteed present.
- **`FIRST_PARTY_CLIENT_ID`** — Constant `'first-party'`; the sole `client_id` value stamped into access tokens (RFC 9068 §2.2).
- **`RotatedSession`** — Return shape handed to controllers after a rotation: new access/refresh tokens, cookie `maxAge`, and `userId`.
- **`TokenRejection`** — Error subclass carrying a `ResolveMissReason` (`expired`, `invalid_signature`, `malformed`, `revoked`). The one rejection type the kernel resolver maps to a `{ miss }` answer; everything else stays a plain throw.
- **`verifyAccessToken(token)`** — Stateless verification against the access-token ring. Returns `AccessTokenData`.
- **`verifyRefreshWithRow(token)`** — Verifies against the refresh ring, then looks up the live `SessionRow` by `hashToken(token)`. Rejects with `TokenRejection('revoked')` if the row is missing or superseded. Returns `{ data, row }`.
- **`carriedClaims`** (internal) — Extracts the subset of claims (`sub`, `auth_time`, `amr`, `remember`) copied forward on rotation and access-token mint.
- **`TOKEN_TYPE_HEADER` / `AUDIENCE_OF` / `REQUIRED_CLAIMS`** (internal) — Per-kind (`access` | `refresh`) `typ`, `aud`, and required-claim lists used in the `jwtVerify` options.
- **`ringKeyLookup`** (internal) — Resolves a `kid` header to the matching HMAC key bytes from the ring; throws `TokenRejection('invalid_signature')` for unknown keys.
- **`verifyAgainstRing`** (internal) — Shared verifier: HS256-pinned, checks `typ`, `iss`, `aud`, `requiredClaims`, then shape-checks the payload via `carriesTokenClaims`.

## Relationships

- **`./config`** — Source of all policy: access/refresh rings, issuer, audiences, expiry times, rotation grace, and reuse-detection window. This file never hard-codes a secret or TTL.
- **`./key-ring`** — Provides `keyId` (for stamping `kid` on sign) and `keyForId` (for the verification key lookup).
- **`./strategy`** — Supplies the `SessionSnapshot` type used when minting new tokens from a session row.
- **`../repository`** — `sessionRepository.findByHash` is the DB lookup behind `verifyRefreshWithRow`; `SessionRow` is the persisted session shape.
- **`@infrastructure/security/hash-token`** — `hashToken` produces the deterministic hash used as the DB key for refresh-token lookup (the raw token is never stored).
- **`@kernel/authentication`** — `ResolveMissReason` type, which `TokenRejection.reason` is typed against, so the kernel resolver can map rejections to HTTP-level misses.
- **`./activity`** — `recordActivity` is called (in the full file) to stamp last-seen on the session row during access-token verification.
- **`./mint-guard`** — `assertProofCurrent` and `assertSecondFactor` gate the mint path, ensuring the proof is fresh before a new token pair is issued.
- **`./family-liveness`** — `resolveInLiveFamily` determines whether a rotation is part of a still-alive session family (reuse-detection / grace logic).
- **`../domain/epoch`** — `predatesSessionEpoch` checks whether a token's `auth_time` predates the session's epoch (rejects replayed/stale proofs).
- **`../services/revocation`** — `revokeFor` is invoked when a reuse or superseded-token condition is detected, invalidating the whole family.
- **`./auth-context`** — `resolveProof` extracts the proof metadata needed by `mint-guard` at mint time.
- **`../services/refresh`** — The service that orchestrates the full rotation flow (verify → revoke-old → mint-new) using this file's verify/mint primitives.
- **`../controllers/get-refresh-token`** — HTTP controller that calls the refresh service and serializes the `RotatedSession` into a response.

## Notes

- **Token-kind separation is enforced in three layers**: the `typ` header (`at+jwt` vs `rt+jwt`), the `aud` claim, and the `requiredClaims` list. A refresh token presented as a bearer is rejected even if both rings share a secret.
- **`auth_time` is never re-stamped from the clock.** It is copied forward from the original login proof on every mint and rotation. This is what makes `mint-guard`'s freshness check meaningful.
- **`remember` is optional and absent for browser-session logins.** A rotation that accidentally dropped it would silently upgrade a session cookie to a persistent one — hence the explicit conditional spread in `carriedClaims`.
- **`sid` is access-token-only.** Refresh tokens *are* the session credential; they carry no `sid`. The type system enforces this via `AccessTokenData`.
- **`TokenRejection` is the only error the caller (kernel resolver) distinguishes.** Non-jose, non-`TokenRejection` errors (outages, bugs) propagate unchanged and should surface as 5xx, not 401.
- **Key lookup happens after parsing but before signature verification** (it *is* the key provider in `jwtVerify`). An unknown `kid` is classified as `invalid_signature`, not a separate reason, because from the caller's perspective both mean "log in again."
