---
source: src/modules/account/session/auth-context.ts
source_sha256: 0348ebe725499d187c9e9b17de71a20ff69d7ce8c543b516d15d6ad864d62c55
context_sha256: 01c4bd0e08e950d8d6f10af7246aecb440684e2f32003edbc889aae2642954b1
generated_at: 2026-11-22T03:45:06.397134+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/auth-context.ts

## Purpose
Turns a session's proof (`authTime` plus `amr`) into the `AuthContext` that guards read. It is the half of request resolution shared by both session modes. The cookie and JWT strategies decide how a credential becomes a proof. This file decides what the proof means: whether the account may still sign in, whether the session epoch has passed the proof, and which roles the account holds right now.

## Key elements
- `SessionProof` (interface): `authTime` is epoch seconds of the last real proof. It is copied forward on a refresh and renewed only by reauth. `amr` is a readonly list of RFC 8176 method values.
- `resolveProof(userId, proof)`: returns `Promise<AuthContext | undefined>`.
  - Loads the user through the account user service's scoped lookup, `findAuthenticatableById`.
  - Returns `undefined` if the user is not found, or if `predatesSessionEpoch(proof.authTime, user.tokensValidAfter)` is true.
  - Otherwise reads roles from the access service (`rolesOf`, scoped to `DEPLOYMENT_TENANT_ID`) and builds the context.
  - The context contains `id`, `email`, `username`, `roles`, `tenantId`, `imageUrl`, `authTime`, a copy of `amr`, `twoFactorArmed`, `authenticatorArmed` and `verified`. It adds `analyticsConsent` only when `analyticsConsentAt` is set.

## Relationships
- `src/modules/users/friends/account.ts`: exports `accountUserService`, which supplies the user record.
- `src/modules/access/index.ts`: exports `accessService`, which supplies the roles.
- `src/kernel/access/tenant.ts`: `DEPLOYMENT_TENANT_ID` is used both for the role lookup and as the context's `tenantId`.
- `src/modules/account/domain/epoch.ts`: `predatesSessionEpoch` is the epoch check.
- `src/types/auth-context.ts` (via `@types`): defines the returned `AuthContext` type.
- Session strategies: the neighbors `cookie-strategy.ts` and `jwt-strategy.ts`, and their unit tests, sit alongside this file. This file's own comment says both session modes share it.

## Notes
- It uses the scoped lookup rather than `findById`. A deactivated or soft-deleted account stops authenticating on its next request.
- A proof older than the session epoch returns `undefined`, the same as an unknown account, so callers cannot tell the two apart.
- Roles come from stored memberships, read fresh on each resolution. The user document has no `role` field. A `null` role in either scope means no role there. Per the in-code comment, `keysInScope` (`src/kernel/permissions.ts`) turns that into the audience's keys alone for tenant scope, or an empty set for platform scope.
- `tenantId` is a fixed deployment constant. A request cannot name it.
- `twoFactorArmed`, `authenticatorArmed`, `verified` and `analyticsConsent` are read fresh from the user. Changes to them, including a consent withdrawal, apply on the next request regardless of what the session carries.
- `analyticsConsent` is omitted until the account has answered. This means a banner choice made before sign-in still counts, but it never overrides a stored answer.
