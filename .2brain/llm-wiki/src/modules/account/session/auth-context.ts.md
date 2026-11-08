---
source: src/modules/account/session/auth-context.ts
sha256: cd58edd77c5048397600c98e4d6bc10123d871b1140cbb775bf039a835f11772
generated_at: 2026-11-08T04:26:26.924159+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/auth-context.ts

## Purpose

Resolves a session's proof (`authTime` + `amr`) into the `AuthContext` object that downstream guards consume. It is the single shared step after a credential has been validated: regardless of whether the session came from a cookie or a JWT, this function decides whether the account may still act, reads current roles and factor state, and assembles the caller context (or returns `undefined` to deny).

## Key elements

- **`SessionProof`** (interface) — the minimal shape a session strategy must produce: `authTime` (epoch-seconds of last real proof) and `amr` (RFC 8176 methods). Strategies copy `authTime` forward on refresh; only reauthentication renews it.
- **`resolveProof(userId, proof)`** (exported async function) — the sole public entry point. Looks up the account via `userService.findAuthenticatableById`, checks the epoch, fetches roles via `accessService.rolesOf`, and returns a fully populated `AuthContext` or `undefined`.

## Relationships

- **`@kernel/access/tenant`** → imports `DEPLOYMENT_TENANT_ID`, the fixed tenant constant stamped onto every `AuthContext`.
- **`@modules/users`** (index) → imports `userService`; calls `findAuthenticatableById` to get the user record with fresh factor/consent fields.
- **`@modules/access`** (index) → imports `accessService`; calls `rolesOf(userId, tenantId)` to read current role memberships.
- **`@types`** (index) → imports the `AuthContext` type (defined in `src/types/auth-context.ts`) used as the return type.
- **`../domain/epoch`** → imports `predatesSessionEpoch` to reject proofs older than the account's `tokensValidAfter`.
- **`cookie-strategy.ts` / `jwt-strategy.ts`** (siblings) — produce a `SessionProof` and hand it to `resolveProof`; they differ only in how the credential becomes that proof, not in what the proof means.

## Notes

- `rolesOf` returns a scoped object with **no fallback**: a missing role in a scope is `null`, which `keysInScope` in `kernel/permissions.ts` maps to the audience's own keys (tenant) or an empty set (platform). There is no implicit "default" role.
- `analyticsConsent` is **conditionally present** on the returned object (spread `...(… ? {} : {…})`). Consumers must treat its *absence* as "no answer yet," not as `false`.
- `twoFactorArmed`, `authenticatorArmed`, and `verified` are read from the user document at call time, not cached in the session token — toggling a factor takes effect on the very next request.
- A proof that `predatesSessionEpoch` is indistinguishable downstream from a missing/unknown account; nothing in the `AuthContext` shape records *why* it was denied.
