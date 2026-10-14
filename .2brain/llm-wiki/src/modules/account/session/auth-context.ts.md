---
source: src/modules/account/session/auth-context.ts
sha256: f3ec34ee01ce8ca6b4a310bd383b801254e4e75e67fbfc889aaeed8a4b4d4f60
generated_at: 2026-10-14T08:58:00.004155+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/auth-context.ts

## Purpose

Resolves a verified session proof (auth time + AMR methods) into the `AuthContext` that downstream guards read. This is the shared "what does the proof mean" step that both cookie and JWT session strategies funnel into, so account validity, epoch expiry, and current role membership are decided in exactly one place.

## Key elements

- **`SessionProof`** (interface) — the minimal proof a session must carry: `authTime` (epoch seconds, copied forward on refresh) and `amr` (RFC 8176 method array).
- **`resolveProof(userId, proof)`** (async function) — the sole public function. Looks up the account via a *scoped* query (`findAuthenticatableById`), rejects proofs older than the account's session epoch, reads roles fresh, and returns a fully-populated `AuthContext` or `undefined`.

## Relationships

- **`@modules/users` → `userService.findAuthenticatableById`** — fetches the user document in a way that excludes deactivated / soft-deleted accounts (scoped query, not `findById`).
- **`./epoch` → `predatesSessionEpoch`** — refuses any proof whose `authTime` is before the user's `tokensValidAfter` watermark.
- **`@modules/access` → `rolesOf`** — resolves the user's current role set for the deployment tenant; no fallback is applied here.
- **`@kernel/access/tenant` → `DEPLOYMENT_TENANT_ID`** — fixed constant stamped into `AuthContext.tenantId`; never derived from the request.
- **`@types` → `AuthContext`** — the return type this function produces; consumed by permission guards.
- **`./jwt-strategy.ts` / `./cookie-strategy.ts`** — the two session modes that *produce* a `SessionProof` and then call `resolveProof` to obtain the caller context.

## Notes

- **Scoped lookup, not `findById`.** A deactivated or soft-deleted account is rejected on the very next request, not merely at its next login. Downstream code cannot distinguish "account gone" from "epoch expired" — both yield `undefined`.
- **Roles are read fresh every request.** The user document carries no `role` field of its own; the membership table is the source of truth. `rolesOf` returning `null` for a scope is intentional and maps to the anonymous/empty baseline in `kernel/permissions.ts`.
- **`analyticsConsent ?? false`.** The DB schema defaults the column, but the contract-derived TypeScript type does not know that, so the nullish coalescing is a necessary guard.
- **`amr` is spread (`[...proof.amr]`)** into the returned context to hand out a plain mutable array rather than the caller's readonly reference.
- **`twoFactorArmed`** is derived from `user.twoFactorEnabledAt !== undefined` and read fresh, so arming/removing a 2FA factor takes effect on the next request without requiring re-authentication.
