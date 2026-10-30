---
source: src/modules/account/session/auth-context.ts
sha256: cd58edd77c5048397600c98e4d6bc10123d871b1140cbb775bf039a835f11772
generated_at: 2026-10-29T02:47:02.323474+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/auth-context.ts

## Purpose

Resolves a session's proof (auth timestamp + authentication methods) into the `AuthContext` that downstream guards consume. Both session modes (cookie and JWT) produce a `SessionProof`; this file is the single, shared layer that decides what a valid proof *means*—account still active, epoch not expired, current roles, fresh factor state. The mode decides how a credential becomes a proof; this file decides what a proof grants.

## Key elements

- **`SessionProof`** (interface) — The minimal proof a session must carry: `authTime` (epoch seconds of last real re-authentication, copied forward on refresh) and `amr` (readonly RFC 8176 method strings).
- **`resolveProof(userId, proof)`** (exported const) — Async function returning `Promise<AuthContext | undefined>`. Looks up the account via `userService.findAuthenticatableById`, rejects if missing or if `authTime` predates the account's session epoch, then fetches current roles via `accessService.rolesOf` and assembles the full `AuthContext`. Returns `undefined` for any account that may not authenticate.

## Relationships

- **`src/modules/users/services/index.ts`** (`userService.findAuthenticatableById`) — Source of the account record; scoped lookup that excludes deactivated/soft-deleted accounts on the *next* request, not just at login.
- **`src/modules/account/domain/epoch.ts`** (`predatesSessionEpoch`) — Validates `proof.authTime` against the account's `tokensValidAfter`; a stale proof is indistinguishable downstream from a missing account.
- **`src/modules/access/services/index.ts`** (`accessService.rolesOf`) — Supplies the live role set for the deployment tenant; no fallback, so `null` in a scope means genuinely no role there.
- **`src/kernel/access/tenant.ts`** (`DEPLOYMENT_TENANT_ID`) — Fixed constant stamped into the returned `AuthContext.tenantId`; never derived from the request.
- **`src/types/auth-context.ts`** (`AuthContext`) — The shape this function returns; consumed by permission guards.
- **`src/modules/account/session/cookie-strategy.ts`** / **`jwt-strategy.ts`** — The two session modes that produce a `SessionProof` and delegate to `resolveProof` for the shared "what does this proof mean" step.
- **`src/modules/account/tests/unit/cookie-strategy.test.ts`** / **`jwt-strategy.test.ts`** — Exercise the resolution path through each strategy.

## Notes

- `rolesOf` result is used as-is (no fallback). A `null` scope value means "no role in that scope" and is handled downstream by `keysInScope` (`kernel/permissions.ts`); this file never substitutes a default.
- `amr` is spread (`[...proof.amr]`) into the result so the caller cannot mutate the session's original readonly array.
- `twoFactorArmed`, `authenticatorArmed`, `verified`, and `analyticsConsent` are always read fresh from the user document, not from anything the session carries. A factor change or consent withdrawal applies on the very next request.
- `analyticsConsent` is **conditionally present**: the key is omitted entirely until the account has given an answer, so a banner choice made before sign-in is not silently overridden.
- The function intentionally returns `undefined` (not `null` or a sentinel object) for rejected accounts, making the "no caller" state a single, uniform value for guards to check.
