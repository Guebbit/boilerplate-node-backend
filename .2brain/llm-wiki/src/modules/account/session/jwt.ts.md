---
source: src/modules/account/session/jwt.ts
sha256: 6cd3ec6bb9709c6f9de2709d9dab4d0e8a7f0127504d2dad9cce7840a9ce6886
generated_at: 2026-10-14T14:39:31.487853+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/jwt.ts

## Purpose

Central JWT issuance and verification for the account module, built on `jose`. It signs access and refresh tokens with the key rings and TTLs owned by `./config`, verifies them against the correct ring and token type, and (for refresh tokens) cross-checks against the live session row and the user's authentication state. It is the concrete implementation of "issuing and verifying this application's tokens" for the `account` module.

## Key elements

- **`TokenData`** (interface) — the OIDC-aligned claims (`id`, `auth_time`, `amr`, `remember?`, `sid?`) this app signs into every token.
- **`AccessTokenData`** — `TokenData & { sid: string }`; the guaranteed shape after verifying an access token.
- **`RotatedSession`** — `{ accessToken, refreshToken, refreshMaxAgeMs }`, the payload handed back to the controller after a rotation.
- **`TokenRejection`** (class) — an `Error` subclass carrying a `ResolveMissReason`; the single rejection type the kernel resolver translates into a `{ miss }` response.
- **`verifyAccessToken(token)`** (exported) — stateless verification against the access ring; returns `AccessTokenData`.
- **`verifyRefreshToken(token)`** (exported) — JWT verification **plus** DB lookup of the live session row and a scoped check that the account may still sign in.
- **`signToken(claims, ring, kind, lifetimeSeconds, jti?)`** (internal) — signs a payload with the ring's current key, stamps `kid`, `typ`, `exp`, and optionally `jti`.
- **`rejectionOf(error)`** (internal) — maps `jose` error classes to `TokenRejection` with the appropriate reason (`expired`, `invalid_signature`, `malformed`); non-jose errors pass through as-is.
- **`carriesTokenClaims(payload, kind)`** (internal) — runtime shape guard that a verified payload actually carries this app's claims before any field is read.
- **`ringKeyLookup(ring)`** (internal) — the `jwtVerify` key resolver; looks up `kid` in the ring and returns HMAC bytes or throws `TokenRejection('invalid_signature')`.

## Relationships

- **`./config`** — source of all rings (`getAccessTokenRing`, `getRefreshTokenRing`), TTLs (`getExpiryTime`, `getAccessExpiryTime`), rotation grace, and reuse-detection window.
- **`./key-ring`** — provides `keyId` (stamp `kid` at sign time) and `keyForId` (resolve a ring member at verify time).
- **`./epoch`** — `predatesSessionEpoch` is called during refresh verification to reject tokens whose `auth_time` predates the user's `tokensValidAfter` watermark.
- **`./activity`** — `recordActivity` is invoked when a valid token is presented (access-token verification path).
- **`./mint-guard`** — `assertSecondFactor` gates token minting behind a verified second factor.
- **`../services/revocation`** — `revokeFor` is called when reuse detection or a security event requires killing the session family.
- **`../repository`** — `sessionRepository.findByHash` is used to confirm a refresh token maps to a live, non-superseded row; `SessionRow` type is consumed throughout.
- **`@infrastructure/security/hash-token`** — `hashToken` produces the lookup key for the session table (tokens are never stored in plaintext).
- **`@kernel/authentication`** — `ResolveMissReason` union defines the vocabulary of `TokenRejection.reason`.
- **`@modules/users`** — `userService.findAuthenticatableById` scopes refresh-token validity to the account's current authentication state.
- **`./strategy`** — `SessionSnapshot` type is imported (used by the higher-level strategy orchestration that calls into this file).
- **`./jwt-strategy`** — the strategy adapter that wires this file's exports into the `SessionStrategy` interface consumed by the kernel.
- **Tests** — `jwt.test.ts`, `revocation-causes.test.ts`, and `service-flows.test.ts` exercise the full sign/verify/rotate/revoke lifecycle end-to-end.

## Notes

- **Token type is enforced structurally.** Each token kind carries a distinct `typ` header (`at+jwt` / `rt+jwt`, RFC 9068 / RFC 8725 §3.11). A refresh token presented as a Bearer is refused even if both rings share the same secret — the check happens after signature verification, per the RFC.
- **`auth_time` is copy-forward, never re-stamped.** It is set once at login and carried through every access-token mint and rotation. There is no code path that re-reads the clock for this claim.
- **`remember` is optional in the payload.** An `undefined` value is omitted from the JSON to avoid a spurious `null` claim; `carriedClaims` spreads conditionally.
- **Reuse detection is deferred to rotation.** `verifyRefreshWithRow` explicitly does *not* flag a superseded row as reuse — it only checks `mode`, `supersededAt`, and `expiresAt`. The actual RFC 9700 §4.14.2 reuse detection lives in the rotation service.
- **`sid` is access-token only.** Refresh tokens never carry `sid`; the type guard (`carriesTokenClaims`) enforces this per-kind.
- **Algorithm confusion is closed at the verify options level** (`algorithms: ['HS256']`), not by key inspection.
- The file was previously app-level middleware; it moved into the `account` module when the domain was extracted (see `docs/modules/account-sessions.md`).
