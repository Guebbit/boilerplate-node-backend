---
source: src/modules/account/session/jwt.ts
sha256: b3eef5243dbaf8728ea3a6ca931ee945d89c2623147f0e203904cff1eea0f6e8
generated_at: 2026-11-14T18:57:32.940381+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/jwt.ts

## Purpose

Core JWT signing and verification for the account session module, built on `jose`. Owns the wire format of access and refresh tokens, enforces token-kind separation via `typ`/`aud`, resolves signing keys from a rotation ring, and checks refresh-token revocation against the session repository. All secrets, TTLs, and audience/issuer values are sourced from `./config`; this file contains no policy of its own.

## Key elements

- **`TokenData`** — interface for the custom claims (`sub`, `auth_time`, `amr`, `remember?`, `sid?`, `client_id?`) stamped into every token. Access tokens always carry `sid` and `client_id`; refresh tokens carry neither.
- **`FIRST_PARTY_CLIENT_ID`** — constant `'first-party'`, the sole `client_id` value this app issues (RFC 9068 §2.2).
- **`RotatedSession`** — the shape a rotation hands to the controller (`userId`, both tokens, optional `refreshMaxAgeMs`).
- **`TokenRejection`** — extends `Error`; carries a `reason: ResolveMissReason` so the kernel resolver can distinguish *expired*, *invalid_signature*, *malformed*, and *revoked* from opaque failures.
- **`verifyAccessToken(token)`** — stateless verification against the access-token ring; returns `AccessTokenData`.
- **`verifyRefreshWithRow(token)`** — verifies against the refresh ring **and** looks up the live session row by hashed token; rejects with `revoked` if the row is superseded.
- **`carriedClaims(payload)`** — picks only `sub`, `auth_time`, `amr`, and (when present) `remember` for copy-forward on rotation; drops `sid`/`client_id` deliberately.
- **`TOKEN_TYPE_HEADER`** — maps `access` → `'at+jwt'`, `refresh` → `'rt+jwt'` so a token of one kind is refused as the other.
- **`verifyAgainstRing(token, ring, kind)`** — internal verifier: pins `HS256`, `typ`, `iss`, `aud`, and `requiredClaims`, then shape-checks via `carriesTokenClaims`.
- **`ringKeyLookup(ring)`** — key-resolver callback for `jwtVerify`; throws `TokenRejection('invalid_signature')` if the `kid` names no current ring member.
- **`rejectionOf(error)`** — normalises `jose` error classes into `TokenRejection` instances; non-jose errors re-throw unchanged.

## Relationships

- **`./config`** — sole source of rings, issuer, audiences, expiry times, rotation-grace, and reuse-detection window. Every getter is called at verification/mint time, never cached at module level.
- **`./key-ring`** — provides `keyId` and `keyForId` used by `ringKeyLookup` to resolve a `kid` to HMAC key bytes.
- **`@infrastructure/security/hash-token`** — `hashToken` hashes the raw refresh token before the DB lookup in `verifyRefreshWithRow`.
- **`../repository`** — this file imports the `SessionRow` type and the `sessionRepository` instance from here; `verifyRefreshWithRow` calls `sessionRepository.findByHash` to perform the revocation check.
- **`@kernel/authentication`** — this file imports the `ResolveMissReason` type from here and uses it to type the `reason` field on `TokenRejection`.
- **`../services/revocation`** — `revokeFor` is called (in the truncated portion) to mark a session revoked when reuse is detected.
- **`./mint-guard`** — `assertProofCurrent` and `assertSecondFactor` gate the minting path (enforcing that `auth_time` is still fresh and that 2FA was satisfied before a new token is issued).
- **`./auth-context`** — `resolveProof` extracts the proof metadata used during minting.
- **`./family-liveness`** — `resolveInLiveFamily` checks that the session belongs to a still-live family before allowing rotation.
- **`./activity`** — `recordActivity` is invoked on successful verification to update last-seen timestamps.
- **`../domain/epoch`** — `predatesSessionEpoch` is used to reject tokens minted before the current session epoch.
- **`./strategy`** — `SessionSnapshot` type is imported for the strategy interface this file participates in.
- **`../services/refresh`** — consumes `RotatedSession` and the verification/mint exports to implement the full rotation flow.

## Notes

- **Token-kind separation is enforced in three layers:** `typ` header, `aud` value, and `requiredClaims` (access requires `client_id`; refresh does not). A refresh token presented as a bearer is rejected even if both rings currently share a secret.
- **`carriedClaims` drops `sid` and `client_id`** intentionally — each new access token is stamped from its own `SessionRow`; carrying them forward would be incorrect.
- **`auth_time` is copied forward, never re-stamped.** It records when the user last *proved* themselves. A rotation that overwrote it with "now" would silently extend the proof window.
- **`remember` is optional and conditionally spread** (`...(remember && { remember })`) so an absent tier does not serialise a meaningless `null`/`undefined` into the payload.
- **`TokenRejection` vs. plain errors:** only `TokenRejection` instances are mapped to a `{ miss }` resolver answer. Any other thrown error (outage, bug) propagates as a hard failure — do not catch broadly.
- **`ringKeyLookup` throws on unknown `kid`** rather than returning `undefined`, because `jwtVerify` would otherwise treat it as a validation error with a less actionable message. The `invalid_signature` reason is chosen deliberately: from the caller's perspective, "key not in my ring" and "bad signature" both mean "re-authenticate."
- **`verifyRefreshWithRow` still finds superseded rows** (for reuse detection and multi-tab grace); the *credential* check is separate from the *row lookup*.
