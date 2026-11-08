---
source: src/modules/account/session/account-view.ts
sha256: 2e71cc56e2bc1748257ecb39ef25e9e6cd95fe8d8d09dec7f98a7e0c83d04ebf
generated_at: 2026-11-08T04:26:00.890859+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/account-view.ts

## Purpose

Builds the client-facing payload that accompanies a credential: the caller's abilities (in both tenant and platform scopes), the idle-clock state, and the account itself. By bundling all three into a single response, sign-in and refresh answers eliminate follow-up reads. Used by `GET /account`, the three sign-in controllers, and the refresh-token controller.

## Key elements

- **`modelVersion`** (module-private) — A fingerprint computed from `PERMISSION_RULES` IDs via `permissionModelVersion`. Changes only when the rule *set* changes (add, remove, rename), not when a role's permissions shift. Clients cache abilities and use this to detect a stale model.
- **`rulesFor(caller)`** (module-private) — Builds a CASL `Ability` with `buildAbility` and serialises its rules with `packRules` into compact tuple form for the wire.
- **`abilitiesOf(context)`** — Assembles the full `Abilities` object: tenant rules, platform rules, `grantableRoles`, `secondFactorRequired`, and `version`. Omitting `tenantId` entirely when the caller has no shop (no nullable field in the contract).
- **`activityOf(context)`** — Returns `lastActiveAt` (current timestamp) and `idleTimeoutSeconds` only when the caller's roles carry an idle limit.
- **`accountViewOf(user, context)`** — Combines `userService.toAccount`, `abilitiesOf`, and `activityOf` into the `AccountView` shape returned by `GET /account`.
- **`abilitiesOfUser(userId)`** — Re-resolves the full context for a user ID (synthetic "now" `authTime`) and returns `abilitiesOf` or `undefined` if the account can no longer authenticate. Used on refresh so a mid-session grant is visible.
- **`withAccountView(issued, userId, proof)`** — Wraps a freshly minted `IssuedSession` with the account view by resolving proof and fetching the user in parallel. Falls back to the bare credential if the user has vanished.

## Relationships

- **`src/kernel/ability.ts`** — Imports `buildAbility` to construct the CASL ability whose rules are then packed.
- **`src/kernel/permissions.ts`** — Imports `callerInScope` (scope-specific caller projection), `permissionModelVersion`, `staffRoleWithheld`, and `PERMISSION_RULES`.
- **`src/modules/access/index.ts`** / **`src/modules/access/services/grants.ts`** — Source of `grantableRoles`, which lists roles the caller may assign within the tenant scope.
- **`src/modules/users/index.ts`** / **`src/modules/users/services/index.ts`** — `userService.toAccount` shapes the account field; `userService.findByIdWithPendingEmail` fetches the user record (with pending email) for sign-in/refresh.
- **`src/modules/account/session/auth-context.ts`** — Imports `resolveProof`, which turns a userId + JWT-style proof into the `AuthContext` consumed by every export in this file.
- **`src/modules/account/session/idle.ts`** — Imports `idleLimitMilliseconds` to determine whether and how long the caller's session can go idle.
- **`src/modules/account/session/strategy.ts`** — Imports the `IssuedSession` type (the minted credential that `withAccountView` augments).
- **Controllers** (`get-account`, `post-login`, `post-login-2fa`, `post-login-restore`, `get-refresh-token`, `post-session-touch`) — The sole consumers of the exported functions; they call `accountViewOf`, `abilitiesOfUser`, `withAccountView`, or `activityOf` to shape their HTTP responses.

## Notes

- **Abilities are render-only.** The packed rules shipped to the client decide *what UI to show*, never *what is allowed*. Every request is re-evaluated server-side; the client copy carries no authority.
- **`packRules` cast.** The wire type (`PackedRules`) is a manual cast because OpenAPI cannot express a CASL rule tuple with trailing `undefined`. JSON serialisation drops the trailing `undefined` naturally; the cast only names the sent shape.
- **`modelVersion` semantics.** It is a fingerprint of the *rule set*, not a role fingerprint. Editing a role's permissions does not bump it; renaming or swapping a rule does. Clients should treat a version change as "rebuild the ability from scratch," not as "this user changed."
- **`withAccountView` graceful degradation.** If the user record is missing at read time (race between mint and read), the function returns the bare `issued` credential with no `account` field rather than throwing.
- **`abilitiesOfUser` synthetic time.** It passes `authTime: now` and `amr: []` because it only reads the rules — it never validates the proof. The real `auth_time` is irrelevant to the output.
