---
source: src/types/auth-context.ts
sha256: 1e5b7ac920559b5c8afbe99426431d35c3d31772a73ab4414d5b2cca68f6b751
generated_at: 2026-11-08T09:16:17.478958+00:00
model: ollama:qwen3.8:27b
---

# src/types/auth-context.ts

## Purpose

Defines the type contracts for identity and authorization in the request pipeline: `AuthContext` (what the resolver knows about a caller), `Caller` (what an authorization rule may safely read), and `CallerContext` (what a service needs about the request). These types let controllers, middleware, and the kernel resolver depend on a transport-safe shape without importing Mongoose document types, and they make cross-tenant reads and half-formed callers impossible to express by accident.

## Key elements

- **`AUTHORIZATION_SCOPES` / `AuthorizationScope`** — Re-exported from `@api/permission-vocabulary`; the two-world scope vocabulary (`tenant` / `platform`) generated from `shared/authorization-keys.yaml`.
- **`AuthContext`** — The resolved caller identity: `id`, `email`, `username`, `roles.tenant`, `roles.platform`, `tenantId`, `authTime`, `amr`, `twoFactorArmed`, `authenticatorArmed`, `verified`, `analyticsConsent`, `imageUrl?`. Produced by the kernel resolver; threaded through the request.
- **`Caller`** — Discriminated union (`TenantCaller | PlatformCaller`). The shape an authorization rule reads. `permissions` and `scope` are required (fail-closed); identity fields are optional (a stranger has none).
- **`TenantCaller`** — The `'tenant'` arm. `tenantId` is a proven `string`. Carries `permissions`, `unrestricted`, and `system` (computed once at build time so `infrastructure` need not reach into `kernel`).
- **`PlatformCaller`** — The `'platform'` arm. `tenantId` is proven `null`. Same `permissions`/`unrestricted`/`system` fields.
- **`CallerContext`** — Everything a service tier needs about the request: `caller`, `actorRoleName?`, `actorCredentialId?`, `ip?`, `userAgent?`, `host?`, `requestId?`, `clientRequestId?`, `locale?`, `analyticsConsent`. Built once in the controller; the service never sees a `Request`.
- **`TenantCallerContext`** — A `CallerContext` whose `caller` is narrowed to `TenantCaller`, so tenant-only services can read `context.caller.tenantId` as `string` without runtime narrowing.

## Relationships

- **`src/infrastructure/http/request.ts`** — Owns `callerContextOf` / `tenantCallerContextOf` (the functions that *build* a `CallerContext` from a live request) and `anonymousCaller()` / `STRANGER`. This file defines the types those functions return.
- **`src/kernel/permissions.ts`** — Consumes `Caller.permissions` for rule evaluation; computes `unrestricted` and `system` at build time; `callerInScope` gates 2FA-sensitive roles; `audienceOf` derives the audience role from `AuthContext.verified`.
- **`src/kernel/authentication.ts`** — The resolver that produces `AuthContext` from a verified token; the single source of truth for identity fields.
- **`src/kernel/middlewares/authorizations.ts`** — Guards that consume `Caller` / `CallerContext` to enforce permission rules before a handler runs.
- **`src/kernel/ability.ts`** / **`src/kernel/access/query.ts`** — Kernel access primitives that operate over `Caller` scope and `permissions`.
- **`src/infrastructure/observability/audit.ts`** — Reads `actorRoleName`, `actorCredentialId`, `unrestricted`, and `system` from `CallerContext` / `Caller` to populate audit rows.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` gates on `CallerContext.analyticsConsent`.
- **`src/infrastructure/observability/security-events.ts`** / **`forbidden.ts`** — Record security-relevant events using caller identity from `CallerContext`.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Reads caller identity from `CallerContext` for rate-limit scoping.
- **`src/modules/access/services/grants.ts`** — Service-tier consumer of `CallerContext` for grant operations.
- **`src/kernel/translation.ts`** — Uses `CallerContext.locale` as the fallback language for copy.

## Notes

- `roles` in `AuthContext` are **names**, not keys. Nothing decides authorization from them directly; `callerFor` (in `kernel/permissions.ts`) maps them to permission keys per scope. A deployment may rename roles without changing decisions.
- `tenantId` in `AuthContext` is read from the account document, never from a request parameter — this makes cross-tenant reads structurally impossible rather than convention-only.
- `Caller` is discriminated on `scope`; narrowing on `scope` gives you `tenantId: string` (tenant) or `tenantId: null` (platform) with no runtime check or non-null assertion.
- `unrestricted` and `system` are computed once where the caller is built, not re-derived at each call site. This exists because `infrastructure` may not import from `kernel` (enforced in `eslint.config.ts`), so the values must travel on the type itself.
- `analyticsConsent` is **opt-in**: `false` covers both "denied" and "never asked." `emitAnalyticsEvent` is the sole reader.
- The file is intentionally type-only: functions that *build* a `CallerContext` from a live `Request` live in `http/request.ts`, keeping this module free of HTTP concerns.
