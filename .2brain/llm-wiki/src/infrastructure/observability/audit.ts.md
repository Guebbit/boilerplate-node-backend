---
source: src/infrastructure/observability/audit.ts
sha256: 0345ef964db967a5c9c96fb2dd041b338a8f83ced1802c35fbd637c391c2dc04
generated_at: 2026-10-14T08:05:27.266013+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/audit.ts

## Purpose

Defines the structured audit-trail subsystem: the "who did what to which resource, and did it work" record. It is deliberately separate from application logging—audit entries are a security/compliance artefact written to a dedicated always-on `auditLogger` with a stable, machine-readable field set that must not be reshaped for convenience.

## Key elements

- **`coreAuditActions`** — `as const` object of app-level action strings in `security.*` namespace (unauthorized, forbidden, rate-limit hit, reauth-required, token/key/webhook invalid). These are emitted by guards *before* any domain module sees the request, so they live here rather than in a module.
- **`AuditActionMap`** — empty `interface` serving as a declaration-merging seam; each domain module (e.g. `modules/account/audit.ts`) augments it with its own action strings, keeping `infrastructure` free of module imports.
- **`AuditAction`** — union of `CoreAuditAction | AuditActionMap[keyof AuditActionMap]`; deleting a module removes its actions from the union.
- **`AUDIT_ACTOR_ROLES` / `AUDIT_OUTCOMES` / `AUDIT_LEVELS`** — closed enum-like const arrays (`admin|user|anonymous|system`, `success|failure`, `info|warn`).
- **`AuditEvent`** — the full structured payload: actor (userId, role, roleName, credentialId, scope), action, outcome, ip, userAgent, requestId, traceId, targetType/Id, and a free-form `metadata` bag (subject to redaction).
- **`AuditEntry`** — `AuditEvent` + `timestamp` + `level`, populated at emit time.
- **`AuditSink`** — `(entry) => void` port for persistence; `registerAuditSink` installs it once at module registration. Unregistered is a valid state (unit tests, queue workers).
- **`emitAuditEvent(event)`** — the sole emit path: writes the log line via `auditLogger.log`, then fire-and-forget calls the sink inside a `try/catch` so a misbehaving sink cannot fail the request.
- **`extractRequestContext(context)`** — pulls `ip`, `userAgent`, `requestId`, `traceId` from a `CallerContext` (trace id read from ambient OTel span).
- **`resolveActorRole(context)`** — maps the pre-computed caller flags (`unrestricted`, `system`) onto the four-way role enum without re-deriving permission logic in infrastructure.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — imports `auditLogger`, the dedicated winston instance with a fixed field schema.
- **`src/infrastructure/observability/tracer.ts`** — imports `getActiveSpanContext` to stamp `traceId` onto audit entries.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — emits `coreAuditActions.SECURITY_RATE_LIMIT_HIT` when a client is throttled.
- **`src/kernel/middlewares/authorizations.ts`** — emits `SECURITY_UNAUTHORIZED` / `SECURITY_FORBIDDEN` / `SECURITY_REAUTH_REQUIRED` on pre-domain refusals; also the one caller that overrides `actorScope` for platform-key checks.
- **`src/modules/account/services/*`** (deletion-request, email-change, export, logout, oauth, password-reset-request) — call `emitAuditEvent` with module-specific actions registered via `AuditActionMap` augmentation.
- **`src/modules/access/service.ts`** — emits access-grant/revoke audit events.
- **`src/modules/access/tests/integration/access.test.ts`** — asserts audit entries are produced for access decisions.
- **`src/infrastructure/observability/security-events.ts`** — sibling observability module; shares the `security.*` action namespace convention.
- **`scripts/docs/generate-audit-actions.ts`** — reads `coreAuditActions` (and augmented maps) to generate reference documentation.

## Notes

- **Declaration merging is the extension mechanism.** `AuditActionMap` is intentionally empty; each module's `audit.ts` does `declare module '…/audit' { interface AuditActionMap { … } }`. There is no central registry to forget to update.
- **`actorScope` default is tenant.** `context.caller` is always resolved in tenant scope, so a platform-key guard must pass the scope it actually resolved explicitly, or the entry mis-records a platform refusal as a tenant one.
- **Sink contract is fire-and-forget.** `registerAuditSink` is called from a module's `onRegistered` (not DB-connect), and the sink must never throw or reject. `emitAuditEvent` wraps the call in `try/catch` as a backstop.
- **Fields are camelCase in code, Mongo, and the API.** The logger's `semanticNamesFormat` renames them to OpenTelemetry semantic-convention names *in the log line only*; stored entries keep camelCase.
- **`actorRole` is a snapshot.** It records the privilege level *at the time of the action*, so a later role change cannot rewrite the audit trail. `actorRoleName` carries the tenant-specific role string for human readability without coupling queries to the closed enum.
- **`infrastructure` may not import `@kernel/*` or `@modules/*`** (enforced by ESLint). Role resolution and persistence are therefore done via pre-computed flags on `CallerContext` and the `AuditSink` port, respectively.
