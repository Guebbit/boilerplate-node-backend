---
source: src/types/auth-context.ts
sha256: faeac4ad4012ef23f224f1a1f3e4772f88b39693665aaf8136abd6851bd258cc
generated_at: 2026-11-14T22:55:55.312117+00:00
model: ollama:qwen3.8:27b
---

# src/types/auth-context.ts

## Purpose

Defines the transport-safe type vocabulary for "who is making this request" across three layers: the resolved identity (`AuthContext`), the authorization-relevant projection (`Caller`), and the per-request service context (`CallerContext`). It decouples controllers, middleware, and the `@kernel` resolver port from Mongoose `UserDocument` internals so that no consumer needs to import the document shape.

## Key elements

- **`AuthContext`** — The full resolved caller: `id`, `email`, `username`, `roles` (with `tenant` / `platform` sub-fields, each `string | null`), `tenantId`, `authTime`, `amr`, `twoFactorArmed`, `authenticatorArmed`, `verified`, `analyticsConsent?`. Produced by the kernel resolver; never contains a live document reference.
- **`Caller`** — Discriminated union (`TenantCaller | PlatformCaller`) on `scope: 'tenant' | 'platform'`. This is what authorization rules see. `permissions: readonly string[]` and `scope` are required (fail-closed); `id` is optional (a stranger has none).
- **`TenantCaller`** — Caller arm where `tenantId: string` (compiler-proven). Adds `unrestricted: boolean` (holds every declared rule) and `system: boolean` (is `SYSTEM_ACTOR`).
- **`PlatformCaller`** — Caller arm where `tenantId: null` (platform scope is tenant-less by definition). Same `unrestricted` / `system` fields.
- **`CallerContext`** — The bag a service receives: `caller: Caller`, `actorRoleName?`, `actorCredentialId?`, `ip?`, `userAgent?`, `host?`, `requestId?`, `clientRequestId?`, `locale?`, `analyticsConsent`. Built once in the controller; threaded explicitly (no `AsyncLocalStorage`).
- **`TenantCallerContext`** (truncated in listing) — `CallerContext` narrowed so `caller` is proven `TenantCaller`, letting tenant-only services read `caller.tenantId` as `string` without runtime narrowing.
- **Re-export `AUTHORIZATION_SCOPES` / `AuthorizationScope`** — Sourced from `@api/permission-vocabulary`; the YAML (`shared/authorization-keys.generated.yaml`) is the single spelling point.

## Relationships

- **`src/infrastructure/http/request.ts`** — Owns `callerContextOf` / `tenantCallerContextOf`, the HTTP-specific builders that turn a live Express `Request` into the types declared here. This file intentionally holds no builder logic.
- **`src/kernel/permissions.ts`** — Consumes the caller's permission key list (from the `Caller` type) for `keysInScope`, `holdsEveryDeclaredRule`, `callerInScope`, and `audienceOf`; the `unrestricted` / `system` flags on `TenantCaller` exist specifically so this module needn't be re-imported past the kernel boundary by infrastructure code.
- **`src/kernel/authentication.ts`** — The resolver that produces `AuthContext` from a token/document pair; the single producer of this shape.
- **`src/kernel/middlewares/authorizations.ts`** — Reads `Caller` / `CallerContext` to gate route access per scope.
- **`src/kernel/ability.ts`** / **`src/kernel/access/query.ts`** — Consume `Caller` for ability and access-query decisions.
- **`src/kernel/translation.ts`** — Reads the request locale from `CallerContext` for response copy negotiation.
- **`src/infrastructure/observability/audit.ts`** — Reads the actor role name and credential id from `CallerContext` to populate the audit trail's `actorRole` / `actorCredentialId` fields.
- **`src/infrastructure/observability/analytics/index.ts`** — Gates `emitAnalyticsEvent` on the consent flag carried in `CallerContext`.
- **`src/infrastructure/observability/forbidden.ts`** / **`security-events.ts`** — Record caller identity from `CallerContext` on denial / security events.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Reads `CallerContext` (ip, credential) for per-caller rate limiting.
- **`src/globals.d.ts`** — May declare ambient types that reference or augment these interfaces.
- **`scripts/contracts/permission-security.ts`** — Contract-tests that permission key vocabulary stays consistent with the `AuthorizationScope` re-export.
- **`scripts/docs/generate-role-matrix.ts`** — Reads the generated scope/role data to produce documentation; depends on the same vocabulary this file re-exports.

## Notes

- **Two types, one source of truth.** `AuthContext` and `Caller` are deliberately separate interfaces (not aliases). `AuthContext` carries identity fields (`email`, `username`, `imageUrl`) that an authorization rule must never read; `Caller` omits them so a rule that needs them is a type error. Keeping them as one interface would allow silent drift.
- **`roles` is a pair, not a single value.** A person may hold both a tenant and a platform role. `callerFor` (in the kernel) selects exactly one based on the key's scope, so a bare key is never answered from the platform role and vice-versa.
- **`tenantId` provenance.** On `TenantCaller` it is a non-nullable `string` (every tenant account belongs to `DEPLOYMENT_TENANT_ID`); on `PlatformCaller` it is `null` by definition. Discriminating on `scope` gives the compiler a free null-check.
- **`unrestricted` / `system` are denormalised on purpose.** They are computed once at caller-build time so that infrastructure-layer code (audit, forbidden logs) can read them without importing `kernel/permissions` — the ESLint boundary (`infrastructure` may not reach `kernel`) would otherwise be violated.
- **`analyticsConsent` is opt-in.** `false` covers both "explicitly denied" and "never asked." The only reader is `emitAnalyticsEvent`.
- **No builders in this file.** `callerContextOf` and `tenantCallerContextOf` live in `http/request.ts` because they are HTTP work; this file is types only.
