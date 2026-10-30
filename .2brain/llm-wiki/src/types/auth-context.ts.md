---
source: src/types/auth-context.ts
sha256: 6c0c8d8688841d8aa421058443eea7481e7cd12c899395703fb80d2a5e3dd8c1
generated_at: 2026-10-29T06:36:41.825976+00:00
model: ollama:qwen3.8:27b
---

# src/types/auth-context.ts

## Purpose

Pure type-and-constant module that defines the authentication and authorization vocabulary shared across the kernel, infrastructure, and module layers. It establishes three distinct shapes — `AuthContext` (what a resolved caller *is*), `Caller` (what an authorization rule may *ask* of them), and `CallerContext` (what a service reads about the request) — so that controllers, middleware, and the kernel resolver port never depend on Mongoose `UserDocument` internals. No runtime logic lives here; the functions that build these objects from a live request (`callerContextOf`, `tenantCallerContextOf`) are deliberately kept in `http/request.ts`.

## Key elements

- **`AUTHORIZATION_SCOPES`** – `['tenant', 'platform'] as const`; the canonical source for scope values, also referenced by schema `enum` definitions.
- **`AuthorizationScope`** – Union type derived from `AUTHORIZATION_SCOPES` (`'tenant' | 'platform'`).
- **`AuthContext`** – The fully resolved caller: `id`, `email`, `username`, per-scope `roles` (each `string | null`), `tenantId`, `authTime` (epoch seconds from the token's `auth_time` claim), `amr`, `twoFactorArmed`, `authenticatorArmed`, `verified`, optional `imageUrl` / `analyticsConsent`. Serves as both the kernel resolver's return type and the transport-safe DTO threaded through the request.
- **`Caller`** – Discriminated union `TenantCaller | PlatformCaller`; the shape an authorization rule sees. Identity fields are optional; `scope`, `tenantId`, `permissions`, `unrestricted`, and `system` are required.
- **`TenantCaller`** – `scope: 'tenant'`, `tenantId: string`, plus the common required fields. `unrestricted` (computed once via `kernel/permissions.ts`'s `holdsEveryDeclaredRule`) and `system` (whether the actor is `SYSTEM_ACTOR`) avoid re-importing kernel internals at every call site.
- **`PlatformCaller`** – `scope: 'platform'`, `tenantId: null`; same required fields. `system` is present for symmetry so a `Caller` read never requires narrowing.
- **`CallerContext`** – The service-tier request snapshot: `caller` (always tenant-scope), `actorRoleName`, `actorCredentialId`, `ip`, `userAgent`, `host`, `requestId`, `clientRequestId`, `locale`, `analyticsConsent`. Built once in the controller and passed by reference so a missing context is a compile error, not a silent `AsyncLocalStorage` miss.
- **`TenantCallerContext`** *(truncated in source)* – A `CallerContext` subtype whose `caller` is narrowed to `TenantCaller`, letting tenant-only modules read `caller.tenantId` as a plain `string`.

## Relationships

- **`src/kernel/authentication.ts`** – Defines the resolver port whose return type is `AuthContext`; this file is the contract the resolver fulfills.
- **`src/kernel/permissions.ts`** – Consumes `Caller` / `CallerContext` in `keysInScope`, `callerInScope`, `audienceOf`, and `holdsEveryDeclaredRule`; the `unrestricted` and `system` fields on `TenantCaller` exist specifically to let callers avoid re-importing this module's internals.
- **`src/kernel/ability.ts`** and **`src/kernel/access/query.ts`** – Read `Caller.permissions` and `Caller.scope` to gate access decisions.
- **`src/kernel/middlewares/authorizations.ts`** – Uses `AuthContext` / `Caller` to run per-request authorization checks before handlers execute.
- **`src/kernel/translation.ts`** – Reads `CallerContext.locale` as the fallback for copy localization.
- **`src/infrastructure/http/request.ts`** – Houses `callerContextOf` / `tenantCallerContextOf` which construct a `CallerContext` from a live Express request; explicitly *not* in this file.
- **`src/infrastructure/observability/analytics/index.ts`** – Reads `CallerContext.analyticsConsent` as the sole gate for `emitAnalyticsEvent`.
- **`src/infrastructure/observability/audit.ts`** – Reads `CallerContext.actorRoleName`, `actorCredentialId`, and `caller` to populate audit-row fields.
- **`src/infrastructure/observability/security-events.ts`** / **`forbidden.ts`** – Consume `CallerContext` to attribute security-related events.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** – References `CallerContext` for per-caller rate-limit identity.
- **`src/modules/access/model.ts`** – Depends on `Caller` / `CallerContext` for access-rule evaluation within the access module.
- **`src/globals.d.ts`** – May augment global type declarations that reference these auth types.
- **`scripts/docs/generate-role-matrix.ts`** – Reads `AUTHORIZATION_SCOPES` and role-name conventions to generate documentation.

## Notes

- **No runtime code.** This file exports only a `const` array, a type alias, and interfaces. Any function that *builds* these objects lives elsewhere (`http/request.ts`, the kernel resolver).
- **`AuthContext` ≠ `Caller`.** The split is intentional: `AuthContext` carries identity fields (`email`, `username`, `imageUrl`) that an authorization rule must never need; `Caller` strips them so a rule's type signature is auditable by construction.
- **`roles` is per-scope, not a single value.** A person can hold both a tenant role and a platform role; `callerFor` (in the kernel) selects which one applies to a given key check. A `null` in either slot means "no role in that scope" — it is never a fallback guess.
- **`tenantId` is read from the account, never from a request parameter.** This makes cross-tenant reads un-expressible rather than merely discouraged.
- **`authTime` / `amr` are pass-through.** They originate from the JWT's `auth_time` / `amr` claims (see `TokenData` in `account/session/jwt.ts`) and are read only by `requireFreshAuth`. Do not derive or mutate them here.
- **`analyticsConsent` is opt-in.** `false` covers both "explicitly denied" and "never asked"; `emitAnalyticsEvent` is the sole consumer.
- **Dependency direction is enforced.** `infrastructure/` must not import from `kernel/` (see `eslint.config.ts`). The `unrestricted` and `system` booleans on `TenantCaller` exist to let infrastructure-level code (e.g. the audit trail) read them without crossing that boundary.
- **`CallerContext.caller` is always tenant-scope.** Platform-scope resolution happens in the guard and never travels on this object.
