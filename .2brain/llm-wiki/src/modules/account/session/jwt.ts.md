---
source: src/modules/account/session/jwt.ts
sha256: 39c4a66ccbcecbf6637973bbfc731258a4e55179b2c8d790f57bb8d7497ae03d
generated_at: 2026-10-29T02:49:19.713908+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/jwt.ts

## Purpose

Owns all JWT issuance and verification for the account module. Wraps `jose` with this app's specific policy (key rings, TTLs, audiences, issuer, token-type headers, required claims) so that callers get a small, typed surface (`verifyAccessToken`, `verifyRefreshWithRow`, signing) instead of repeating configuration. Policy knobs live in `./config`; this file is the single point where a token is signed or checked.

## Key elements

- **`TokenData` / `AccessTokenData`** — The custom claims (`sub`, `auth_time`, `amr`, `remember?`, `sid?`, `client_id?`) this app signs into every token. `AccessTokenData` narrows `sid` to required.
- **`FIRST_PARTY_CLIENT_ID`** — Constant `'first-party'`, the sole RFC 9068 `client_id` value.
- **`RotatedSession`** — Shape returned after a refresh rotation (`accessToken`, `refreshToken`, `refreshMaxAgeMs`).
- **`TokenRejection`** — Error subclass carrying a `ResolveMissReason` (`expired`, `invalid_signature`, `malformed`, `revoked`, …) so the kernel resolver can map a refusal to an actionable miss.
- **`verifyAccessToken(token)`** — Stateless HS256 verification against the access key ring; returns `AccessTokenData`.
- **`verifyRefreshWithRow(token)`** — Verifies against the refresh ring, then looks up the live `SessionRow` via `sessionRepository.findByHash(hashToken(token))`; rejects with `revoked` if the row is not live.
- **`carriedClaims`** (internal) — Selects which claims (`sub`, `auth_time`, `amr`, optional `remember`) survive a rotation or access-token mint.
- **`ringKeyLookup`** (internal) — Factory returning the `kid`-based key resolver passed to `jwtVerify`.
- **`verifyAgainstRing`** (internal) — Shared verifier that pins `HS256`, `typ`, `issuer`, `audience`, and `requiredClaims` per token kind, then shape-checks the payload.
- **`rejectionOf`** (internal) — Maps `jose` error classes to the appropriate `TokenRejection` reason.

## Relationships

- **`./config`** — Source of all secrets, TTLs, audiences, issuer, rotation-grace and reuse-detection windows. Read on every sign/verify call; policy changes go here, not here.
- **`./key-ring`** — Provides `keyId` (for `kid` header) and `keyForId` (for the key lookup). The ordered ring array is passed in from config.
- **`./strategy`** — Supplies the `SessionSnapshot` type consumed when minting tokens from a session row.
- **`./mint-guard`** — `assertProofCurrent` and `assertSecondFactor` gate access-token issuance (called before signing).
- **`./auth-context`** — `resolveProof` is consulted during the rotation/verification flow to validate proof freshness.
- **`./family-liveness`** — `resolveInLiveFamily` checks that a refresh token's session family is still live before allowing rotation.
- **`./activity`** — `recordActivity` is called after a successful verification to update the session's last-active timestamp.
- **`../services/revocation`** — `revokeFor` is invoked when reuse detection or a security event requires killing a session family.
- **`../repository`** — `sessionRepository.findByHash` performs the DB lookup that ties a refresh JWT to its `SessionRow`.
- **`../domain/epoch`** — `predatesSessionEpoch` guards against tokens stamped before the session's creation epoch.
- **`@infrastructure/security/hash-token`** — `hashToken` produces the digest used as the DB lookup key (the raw token is never stored).
- **`@kernel/authentication`** — Provides the `ResolveMissReason` union that `TokenRejection` carries, bridging this module to the kernel's resolver port.

## Notes

- **`typ` header separates access from refresh** (`at+jwt` / `rt+jwt`). A verifier demands its own kind, so a refresh token presented as a bearer is refused even if both rings share a secret.
- **`auth_time` and `amr` are copied forward, never re-stamped.** A rotation or access-token mint copies them from the previous token; they are never re-read from the clock. This preserves the original proof moment.
- **`remember` is omitted (not set to `undefined`) when absent** to keep the JWT payload clean; `carriedClaims` conditionally spreads it.
- **`sid` is access-token-only.** A refresh token *is* the session credential; it never carries `sid`.
- **The refresh-token DB lookup uses a one-way hash** (`hashToken`), so the repository stores digests, not raw tokens.
- **`jose`'s `typ` check happens after signature verification** (per RFC 8725 §3.11); a wrong-type token with a valid signature is still classified as `malformed`, not `invalid_signature`.
- **The file is the module's public face for token ops** — the `get-refresh-token` controller and `jwt-strategy` call into the exports here rather than importing `jose` directly.
