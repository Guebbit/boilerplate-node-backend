---
source: src/modules/account/session/auth-context.ts
sha256: 9ba8d0a0ec1cec0bcfb6f02cd1417de41fc2918197bfa20e927bacf307925646
generated_at: 2026-11-14T18:55:50.675869+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/auth-context.ts

## Purpose

Resolves a session proof (`authTime` + `amr`) into the `AuthContext` object that authorization guards read. It is the strategy-agnostic half of request authentication: the cookie and JWT strategies each decide *how* a credential becomes a proof, and this file decides *what* that proof means — whether the account may still act, whether the epoch has invalidated it, and which roles apply right now.

## Key elements

- **`SessionProof`** (interface) — the minimal proof a session must carry: `authTime` (epoch seconds of last real reauth) and `amr` (RFC 8176 methods).
- **`resolveProof(userId, proof)`** (exported function) — the sole public function. Looks up the account via `accountUserService`, rejects the proof if the account is missing/deactivated or if `authTime` predates the account's `tokensValidAfter` epoch, then fetches current roles and assembles the `AuthContext`. Returns `undefined` (never throws) when nobody may act.

## Relationships

- **`src/modules/users/friends/account.ts`** — provides `accountUserService`, used to load the live user document (status, email, 2FA flags, consent) at resolution time.
- **`src/kernel/access/tenant.ts`** — imports the `DEPLOYMENT_TENANT_ID` constant, used as the fixed `tenantId` in every `AuthContext`.
- **`src/modules/access/index.ts`** — provides `accessService`, used to resolve the account's current role memberships.
- **`src/types/auth-context.ts` / `src/types/index.ts`** — provides the `AuthContext` return type.
- **`src/modules/account/domain/epoch.ts`** — provides `predatesSessionEpoch`, used to compare `authTime` against the account's `tokensValidAfter` timestamp.
- **`src/modules/account/session/cookie-strategy.ts` / `jwt-strategy.ts`** — upstream consumers that produce a `SessionProof` and then call `resolveProof` to obtain the `AuthContext`.

## Notes

- Deactivated/soft-deleted accounts and epoch-violated proofs both yield `undefined`; nothing downstream can distinguish the two.
- Roles are fetched fresh on every call (no cache on the user doc). A `null` entry in the roles map is meaningful — `keysInScope` in `kernel/permissions.ts` treats it as "no role in this scope," never as an error.
- `tenantId` is always the deployment constant; it is never derived from the request.
- `amr` is spread-copied (`[...proof.amr]`) so the context owns its own array.
- `analyticsConsent` is conditionally present: omitted entirely when the user has not yet answered, so a pre-sign-in banner choice is not silently overridden.
- `twoFactorArmed`, `authenticatorArmed`, and `verified` are all read from the live user document each call, so arming/removing a factor or verifying an email takes effect on the very next request without a re-login.
