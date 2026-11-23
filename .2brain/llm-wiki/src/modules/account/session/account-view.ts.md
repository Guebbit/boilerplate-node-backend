---
source: src/modules/account/session/account-view.ts
source_sha256: 74127f192e4244542f985afea3b7df350c8aa665a3a987f99a8dfad01a1bcc38
context_sha256: 8acf29c93cc6478899af44ef1b2b449bd3ae1e7a8370ae5ce28018f8b0fd9603
generated_at: 2026-11-22T03:44:47.471499+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/session/account-view.ts

## Purpose
Builds the extra data a session answer carries beyond its credential: the caller's CASL abilities (both scopes), the idle/lifetime clock, and, on sign-in, the full account view, so clients need no follow-up read. The client's copy of the abilities has no authority. It only decides what to render, and every request is re-evaluated server-side.

## Key elements
- `modelVersion` (private): a fingerprint of `PERMISSION_RULES` ids via `permissionModelVersion`. It changes when rules are added, renamed or swapped, not when a role is edited or when the same rules are merely reordered. Clients use it to tell that their cache is about a different model.
- `rulesFor(caller)` (private): builds an ability for one scope and returns its rules in CASL's `packRules` wire format as `PackedRules`. The cast only narrows the type.
- `abilitiesOf(context)` (private): returns `Abilities`, with:
  - `tenant` and `platform` packed rule lists, kept separate;
  - `tenantId`, omitted when the caller has no shop;
  - `grantableRoles`;
  - `secondFactorRequired`;
  - `version`.
- `secondsUntil(until, now)` (private): whole seconds, rounded down and clamped to ≥ 0.
- `activityOf(context)` (exported): returns `SessionActivity`. `lastActiveAt` is always the current time. The idle timeout and remaining seconds appear only when the roles have an idle limit above 0. The lifetime remainder appears only when a staff cap applies. With no `sessionClock` (a fresh sign-in), both countdowns start whole.
- `accountViewOf(user, context)` (exported): returns the `AccountView` for `GET /account`: `accountUserService.toAccount(...)` (given the tenant roles) plus `abilities` and `activity`.
- `abilitiesOfUser(userId)` (exported): used on refresh. It resolves a context through `resolveProof` with a synthetic "just now" proof and returns the abilities, or `undefined` if the account may no longer authenticate.
- `withAccountView(issued, userId, proof)` (exported): resolves the context and reads the user with its pending email in parallel. It returns `{ ...issued, account }` as `AuthTokens`, or just the credential if the account vanished.

## Relationships
- `@kernel/ability` (`buildAbility`) and `@kernel/permissions` (`callerInScope`, `permissionModelVersion`, `staffRoleWithheld`, `PERMISSION_RULES`) supply the ability construction and permission model.
- `@modules/access` (`grantableRoles`) supplies the grantable-role list. A comment says this is the same rule as the 409 the user writes answer.
- `./idle` provides `idleLimitMilliseconds` and `staffCapEndsAt` for the clock.
- `./auth-context` provides `resolveProof`, which resolves a user and proof into an `AuthContext`.
- `./strategy` provides the `IssuedSession` type.
- `@modules/users/friends/account` (`accountUserService`) provides `toAccount` and `findByIdWithPendingEmail`.
- The module header names these callers: `GET /account`, login, its second step (2FA), restore, and refresh. These correspond to the account controllers in the neighbor list, such as `get-account`, `post-login`, `post-login-2fa`, `post-login-restore` and `get-refresh-token`. The file itself does not import them.

## Notes
- The tenant and platform rule lists are deliberately kept apart, because the model refuses to let either satisfy the other. A client renders from both while a request acts in only one.
- `abilitiesOfUser` passes `amr: []` and the current time as `authTime`, since the abilities read nothing from the proof.
- Countdowns round down so a client's countdown never outlasts the server's.
