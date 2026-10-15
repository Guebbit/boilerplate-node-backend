---
source: src/types/auth-context.ts
sha256: b78484d1b7e7fdb7dbdb5e8496f79690cd00b7b351f9543a298084473cea275d
generated_at: 2026-10-15T12:29:42.523429+00:00
model: ollama:qwen3.8:27b
---

# src/types/auth-context.ts

## Purpose

Defines the core type vocabulary for authentication and authorization in the codebase: what a resolved caller *is* (`AuthContext`), what a rule may safely *ask* of them (`Caller`), and what a downstream service *sees* about the request that carried them (`CallerContext`). Exists to decouple HTTP/auth flow from Mongoose document internals — controllers, middleware, and the kernel resolver port depend on these types, never on `UserDocument`.

## Key elements

- **`AUTHORIZATION_SCOPES` / `AuthorizationScope`** — Const tuple `['tenant', 'platform']` and its element type. The two "worlds" a caller can act in; also the source for the schema's `enum`.
- **`RoleLevel`** — `'admin' | 'staff' | 'user'`. Rank read from `shared/authorization-roles.yaml`; used by the access hierarchy rule (`assertCanActOn`).
- **`AuthContext`** — The full resolved caller as the kernel authentication resolver produces it: id, email, username, per-scope role names (`roles.tenant`, `roles.platform`), `tenantId`, `imageUrl?`, `authTime`, `amr`, `twoFactorArmed`, `analyticsConsent?`. One interface shared by the resolver's answer and the transport DTO to prevent drift.
- **`Caller`** (`TenantCaller | PlatformCaller`) — The authorization-decision view. Discriminated on `scope`; identity fields (`email`, `username`, etc.) are deliberately excluded. `scope` and `permissions` are required (fail-closed). `unrestricted` and `system` booleans are pre-computed to avoid importing `kernel/permissions` past the infrastructure boundary.
- **`TenantCaller`** — `scope: 'tenant'`, `tenantId: string`, optional `id`, required `permissions`, `unrestricted`, `system`, `level`.
- **`PlatformCaller`** — `scope: 'platform'`, `tenantId: null`, same permission/system/level fields.
- **`CallerContext`** — Everything a service tier reads about the request: `caller` (always tenant-scope), `actorRoleName?`, `actorCredentialId?`, `ip?`, `userAgent?`, `host?`, `requestId?`, `clientRequestId?`, `locale?`, `analyticsConsent`. Built once in the controller, threaded down so a missing value is a compile error rather than a silent `AsyncLocalStorage` miss.
- **`TenantCallerContext`** — (truncated in source) A `CallerContext` whose `caller` is narrowed to `TenantCaller`, letting tenant-only services demand `tenantId: string` in their signature without runtime narrowing.

## Relationships

- **`src/kernel/authentication.ts`** — Produces `AuthContext` via the resolver; `callerFor` (referenced in docs) turns `AuthContext.roles` into a single `Caller` per key.
- **`src/kernel/middlewares/authorizations.ts`** — Consumes `Caller` to make allow/deny decisions; reads `permissions` and `scope`.
- **`src/kernel/permissions.ts`** — Source of truth for permission keys, `isUnrestricted`, `SYSTEM_ACTOR`, and `keysInScope`; the `unrestricted`/`system` booleans on `Caller` are pre-computed from this module to respect the `infrastructure → kernel` import boundary.
- **`src/kernel/ability.ts`** — Uses `Caller` and `RoleLevel` for ability-level access checks.
- **`src/kernel/access/query.ts`** — Queries access rules against `Caller`'s `permissions` and `scope`.
- **`src/modules/access/service.ts`** — `assertCanActOn` uses `RoleLevel` to enforce the owner-below-caller rank rule.
- **`src/modules/access/model.ts` / `repository.ts`** — Domain model and persistence layer for access rules that the `Caller` types evaluate against.
- **`src/modules/access/tests/unit/hierarchy.test.ts`** — Unit tests exercising the `RoleLevel` hierarchy logic.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` and `tenantCallerContextOf` build `CallerContext` / `TenantCallerContext` from a live Express request (the "HTTP work" that stays out of this type file).
- **`src/infrastructure/observability/audit.ts`** — Reads `CallerContext.actorRoleName`, `actorCredentialId`, `caller.unrestricted`/`caller.system` for audit-trail fields.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` reads `CallerContext.analyticsConsent` as its opt-in gate.
- **`src/infrastructure/observability/security-events.ts`** — Records security-relevant events using the caller identity available in `CallerContext`.
- **`src/globals.d.ts`** — Likely extends global type registrations so these types are available without explicit imports in certain contexts.
- **`scripts/docs/generate-role-matrix.ts`** — Consumes `AUTHORIZATION_SCOPES` (and the role YAML) to generate the role/permission matrix documentation.

## Notes

- **Two type layers, not one.** `AuthContext` (identity) vs. `Caller` (permission view) is intentional. An authorization rule that reads `email` or `username` is unauditable by its type; `Caller` excludes those fields by design.
- **Anonymous callers are values, not gaps.** `anonymousCaller()` builds a `Caller` directly (level `user`, empty permissions). They never appear as `null`/`undefined` in a `Caller` field — a rule that needs an `id` and gets `undefined` drops its own rule rather than widening.
- **`unrestricted` and `system` are denormalised booleans.** Computed once at caller-build time (from `kernel/permissions.ts`) so infrastructure code never imports the kernel. Removing them would re-introduce a boundary violation.
- **`CallerContext.caller` is always tenant-scope.** Platform-scope work resolves its own caller per key in the guard and does not travel on `CallerContext`. This is why `TenantCallerContext` exists — it lets tenant-only services state the requirement in their type signature.
- **`analyticsConsent` defaults to opt-out.** `false` covers both "denied" and "never asked"; the analytics emitter is the sole reader.
- **`authTime`/`amr` come from the JWT's `auth_time` claim** (RFC 8176), never derived. `requireFreshAuth` is the only consumer.
- **`callerContextOf` / `tenantCallerContextOf` live in `http/request.ts`**, not here. This file is types only; request-building is HTTP concern.
