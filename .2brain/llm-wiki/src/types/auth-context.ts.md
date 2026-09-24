---
source: src/types/auth-context.ts
sha256: c7be08b4ca5b22ce2985f5512e619a2896032fada307790ff4ec6291f2f97ad7
generated_at: 2026-09-23T19:50:01.028099+00:00
model: ollama:qwen3.8:27b
---

# src/types/auth-context.ts

## Purpose

Type-only module that decouples the HTTP/auth flow from Mongoose document internals. It defines the shape of a resolved caller (`AuthContext`), the authorization-safe view of that caller (`Caller`), and the request-level context threaded into the service tier (`CallerContext`). Controllers, middleware, and the `@kernel` resolver port depend on these types rather than on `UserDocument`.

## Key elements

- **`AuthorizationScope`** — `'tenant' | 'platform'`; the two worlds a caller can act in.
- **`AuthContext`** — the full resolved caller: `id`, `email`, `username`, `roles.tenant`, `roles.platform`, `tenantId`, `imageUrl?`, `authTime`, `amr`, `analyticsConsent`. One interface so the resolver's answer and the DTO can't drift apart.
- **`Caller`** — discriminated union (`TenantCaller | PlatformCaller`) representing what an authorization rule may safely read. Discriminated on `scope`; `permissions` is required (fail-closed), `id` is optional (a stranger has none).
- **`TenantCaller`** — `scope: 'tenant'`, `tenantId: string` (compiler-proven), `permissions: readonly string[]`, `unrestricted: boolean`.
- **`PlatformCaller`** — `scope: 'platform'`, `tenantId: null`, `permissions: readonly string[]`, `unrestricted: boolean`.
- **`CallerContext`** — everything a service needs about the incoming request: `caller: Caller`, `actorRoleName?`, `actorCredentialId?`, `ip?`, `userAgent?`, `host?`, `requestId?`, `locale?`, `analyticsConsent`. Built once in the controller, threaded down; the service tier never sees a `Request`.
- **`TenantCallerContext`** — extends `CallerContext` narrowing `caller` to `TenantCaller`, so tenant-only services can read `caller.tenantId` as a proven `string` without runtime narrowing.

## Relationships

- **`src/infrastructure/http/request.ts`** — builds `CallerContext` from a live Express request; exports `callerFor` / `tenantCallerContextOf` (the runtime helpers that keep this file type-only).
- **`src/kernel/authentication.ts`** — the resolver port whose return type is `AuthContext`.
- **`src/kernel/permissions.ts`** — provides `keysInScope` (turns role names into permission keys) and `isUnrestricted` (computed into `Caller.unrestricted` at build time).
- **`src/kernel/ability.ts`** — consumes `Caller` to evaluate ability rules.
- **`src/infrastructure/observability/audit.ts`** — reads `CallerContext.actorRoleName` and `CallerContext.actorCredentialId` for the audit trail.
- **`src/infrastructure/observability/analytics/index.ts`** — reads `CallerContext.analyticsConsent` as its opt-in gate in `emitAnalyticsEvent`.
- **`src/modules/access/service.ts`** / **`src/modules/access/model.ts`** — service and model layers that operate on the caller types defined here.
- **`src/modules/account/controllers/get-my-abilities.ts`** — controller that resolves the caller and returns abilities based on `AuthContext` / `Caller`.
- **`src/globals.d.ts`** — ambient type declarations that these interfaces may reference.

## Notes

- This file is **types only**; all runtime helpers (`callerFor`, `tenantCallerContextOf`, `anonymousCaller`) live in `src/infrastructure/http/request.ts`. Importing from this file should never pull in HTTP or Mongoose dependencies.
- `Caller` is intentionally narrower than `AuthContext`: `email`, `username`, `roles`, `imageUrl` are deliberately absent so an authorization rule cannot read identity fields (type-level auditability).
- `TenantCaller.tenantId` is a non-optional `string`; `PlatformCaller.tenantId` is `null`. Narrowing on `scope` is the mechanism that eliminates runtime checks in tenant-only modules.
- `CallerContext` is threaded as an explicit parameter rather than read from `AsyncLocalStorage`, so a missing context is a compile error rather than a silent `undefined` across an async boundary.
- `analyticsConsent` appears on both `AuthContext` and `CallerContext`; the latter is the single reader (`emitAnalyticsEvent`), and `false` covers both "denied" and "never asked" (opt-in).
