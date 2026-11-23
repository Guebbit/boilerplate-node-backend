---
source: src/modules/account/session/jwt.ts
source_sha256: 9e76f3bd242436b30fd1d92fd119e21eb412af01b2a0c537c0b38bcddce13058
context_sha256: ef335d62491e634c76023490eb946dee37e1947e87d0a08e2128ed8747d5c38a
generated_at: 2026-11-22T03:47:34.918299+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/jwt.ts

## Purpose
JWT creation and verification for the account module's JWT session mode, built on `jose`. It issues and verifies this app's access and refresh tokens (two token kinds with separate lifetimes and storage). Secrets, audiences, issuer and TTLs come from `./config`, which owns the policy.

## Key elements
- `TokenData` – the claims every token carries beyond the registered ones: `sub`, `auth_time`, `amr`, and optional `remember` (the RememberTier), plus `sid` and `client_id` (access tokens only).
  - `auth_time`, `amr` and `remember` are copied forward on every mint and rotation, never re-stamped from the clock.
  - `sid` and `client_id` are never carried forward.
- `AccessTokenData` – `TokenData` with `sid` required.
- `FIRST_PARTY_CLIENT_ID` (`'first-party'`) – the only `client_id` issued, as RFC 9068 requires the claim.
- `RotatedSession` – what a rotation returns to the controller: `userId`, `accessToken`, `refreshToken`, and `refreshMaxAgeMs` (`undefined` for a browser-session login, so its cookie stays a session cookie).
- `TokenRejection` – an Error carrying a `ResolveMissReason`. It is the only rejection the resolver turns into a `{ miss }` answer. Any other error stays a rejection (an outage, a bug).
- `verifyAccessToken(token)` – stateless check against the access-token ring. Returns `AccessTokenData`.
- `verifyRefreshWithRow(token)` – checks the JWT against the refresh ring, then looks up the session row by `hashToken(token)` via `sessionRepository.findByHash`. Rejects with `revoked` if the token is not a live session row of an account that may still sign in.
- Internal helpers:
  - `carriedClaims` – picks the claims to carry forward, omitting `remember` when it is absent.
  - `TOKEN_TYPE_HEADER` – `typ` header per kind: `at+jwt` for access, `rt+jwt` for refresh.
  - `AUDIENCE_OF` and `REQUIRED_CLAIMS` – per-kind `aud` and required claims.
  - `rejectionOf` – maps jose errors to `TokenRejection` reasons: `expired`, `invalid_signature`, `malformed`.
  - `carriesTokenClaims` – shape guard on the verified payload.
  - `ringKeyLookup` – resolves the key by `kid`.
  - `verifyAgainstRing` – the core verifier.

## Relationships
- `src/modules/account/session/config.ts` – supplies the access and refresh key rings, issuer, per-kind audiences, expiry times, rotation grace and reuse-detection window.
- `src/modules/account/session/key-ring.ts` – `keyForId` resolves the `kid` header to a ring member, and `keyId` is imported for signing.
- `src/modules/account/repository.ts` – `sessionRepository` and the `SessionRow` type, for refresh-token row lookup.
- `src/infrastructure/security/hash-token.ts` – `hashToken`, so refresh tokens are looked up by hash.
- `src/kernel/authentication.ts` – supplies `ResolveMissReason`, the reason vocabulary of `TokenRejection`.
- `src/modules/account/session/strategy.ts` – supplies the `SessionSnapshot` type.
- `@modules/users/friends/account` – `accountUserService`, used for stored refresh tokens and the user account (declared dependency on `users`).
- Imported for use later in the file:
  - `src/modules/account/domain/epoch.ts` (`predatesSessionEpoch`)
  - `src/modules/account/session/activity.ts` (`recordActivity`)
  - `src/modules/account/session/mint-guard.ts` (`assertProofCurrent`, `assertSecondFactor`)
  - `src/modules/account/services/revocation.ts` (`revokeFor`)
  - `src/modules/account/session/auth-context.ts` (`resolveProof`)
  - `src/modules/account/session/family-liveness.ts` (`resolveInLiveFamily`)
- The graph also lists `src/modules/account/controllers/get-refresh-token.ts`, `src/modules/account/services/refresh.ts` and `src/modules/account/session/jwt-strategy.ts`. Their interaction with this file is not visible in the shown portion.

## Notes
- Verification pins `HS256` (blocking algorithm confusion), the `typ` header, `iss` and `aud`, and a per-kind set of required claims.
  - A refresh token presented as a bearer is refused even if both rings share a secret.
- A `kid` that names no current ring member, whether retired, forged or absent, is refused as `invalid_signature`.
- After the signature check, `carriesTokenClaims` still validates the payload shape, because a signature proves authorship, not shape. Access tokens must carry a string `sid`.
- `verifyAccessToken` is stateless, so session revocation relies on the `sid` claim being checked elsewhere.
- A rotated-away refresh token still has its row, which the rotation reads, but `verifyRefreshWithRow` refuses it.
