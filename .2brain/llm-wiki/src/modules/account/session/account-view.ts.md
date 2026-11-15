---
source: src/modules/account/session/account-view.ts
sha256: a96693f5754926fbb36e6e86c71eac2b25d360b68cbe5d7840e39b318c308d9d
generated_at: 2026-11-14T18:55:07.861758+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/account-view.ts

## Purpose

Shapes the response body for session-related endpoints: it packages the caller's CASL abilities (in both tenant and platform scopes), the idle-clock snapshot, and—on sign-in—the account record itself—into a single payload so the client never needs a follow-up read. The shipped abilities are strictly a rendering hint; every request is still re-evaluated server-side.

## Key elements

- **`modelVersion`** (module-private const) — fingerprint of the declared permission-rule set via `permissionModelVersion`; bumped only when rules change, not when roles do. Tells the client its cached abilities are stale.
- **`rulesFor(caller)`** (module-private) — builds a CASL `Ability` for one scope and packs its rules into the compact wire tuple format (`packRules`).
- **`abilitiesOf(context)`** (module-private) — assembles the full `Abilities` object: tenant + platform rule lists, `grantableRoles`, `secondFactorRequired`, and `version`.
- **`activityOf(context)`** (exported) — returns `{ lastActiveAt, idleTimeoutSeconds? }` from the resolved idle limit; omits the timeout field when no limit applies.
- **`accountViewOf(user, context)`** (exported) — combines the users-module account projection, `abilitiesOf`, and `activityOf` into the `AccountView` shape returned by `GET /account`.
- **`abilitiesOfUser(userId)`** (exported, async) — resolves a fresh `AuthContext` via `resolveProof` and returns the current abilities, or `undefined` if the account can no longer authenticate. Used by the refresh-token flow.
- **`withAccountView(issued, userId, proof)`** (exported, async) — attaches the full `AccountView` to a minted `IssuedSession` so sign-in endpoints (login, 2FA, restore) return credential + account in one response.

## Relationships

- **`src/kernel/ability.ts`** — calls `buildAbility` to construct the CASL ability from a caller context.
- **`src/kernel/permissions.ts`** — imports `callerInScope`, `permissionModelVersion`, `staffRoleWithheld`, and `PERMISSION_RULES` for scope resolution, versioning, and the 2FA flag.
- **`src/modules/access/index.ts`** → **`src/modules/access/services/grants.ts`** — imports `grantableRoles` to compute which roles the caller may grant in the tenant scope.
- **`src/modules/account/session/auth-context.ts`** — imports `resolveProof` (re-resolves the caller for refresh / sign-in) and the `AuthContext` type.
- **`src/modules/account/session/idle.ts`** — imports `idleLimitMilliseconds` for the idle-clock field.
- **`src/modules/account/session/strategy.ts`** — imports the `IssuedSession` type consumed by `withAccountView`.
- **`src/modules/users/friends/account.ts`** — imports `accountUserService` for `toAccount` (account projection) and `findByIdWithPendingEmail` (fresh read at sign-in).
- **Controllers** — `get-account`, `post-login`, `post-login-2fa`, `post-login-restore`, `get-refresh-token`, `post-session-touch`, and `post-email-change` are the upstream callers that invoke the exported functions to build their responses.

## Notes

- The abilities in the response carry **no authority**. They exist solely so the client can decide what to render; the server re-evaluates permissions on every request.
- `modelVersion` is a *fingerprint* of the rule-ID set, not a count or a manually typed integer. Renaming or swapping a rule changes it; merely reordering the same set does not.
- `tenantId` in the `Abilities` object is **absent** (spread-omitted) rather than `null` when the caller has no shop, because the OpenAPI contract declares no nullable field.
- The `as PackedRules` cast on `packRules` output is safe: CASL's type admits `undefined` in the conditions slot, but `packRules` writes `0` and pops trailing falsy members, so `undefined` is never produced at runtime.
- `abilitiesOfUser` fabricates a "just now" `authTime` because ability evaluation reads no proof fields; the actual `auth_time` is irrelevant to the rules.
- Tenant and platform rules are kept as **two separate lists** in the response; the permission model explicitly refuses to let one scope satisfy the other.
