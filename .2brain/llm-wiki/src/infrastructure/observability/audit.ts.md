---
source: src/infrastructure/observability/audit.ts
sha256: 4e31f0e8ae7c3a89c6ae4b370868c43c327fe35e81933bfd16e7fbaafe838544
generated_at: 2026-10-29T02:09:16.891132+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/audit.ts

## Purpose

Defines the structured audit-trail system: a security/compliance record of *who did what to which resource, and did it work*. Deliberately separate from application logging—audit entries use a dedicated always-on `auditLogger` with a stable, machine-readable field set that must not be reshaped for convenience.

## Key elements

- **`coreAuditActions`** (re-exported from `audit-actions.generated.ts`) — app-level action constants in `domain.resource.verb` dot-notation. These cover guards that reject before any domain module sees the request.
- **`AuditActionMap`** — an empty interface intended for declaration merging; each domain module augments it with its own action strings so `infrastructure` never imports from a module.
- **`AuditAction`** — union of `CoreAuditAction` and whatever `AuditActionMap` members exist.
- **`AUDIT_ACTOR_ROLES` / `AUDIT_OUTCOMES` / `AUDIT_LEVELS`** — runtime arrays derived from the schema enums, useful for validation or API responses.
- **`AuditEvent`** — the core shape: actor identity (id, role, role name, credential id, scope), action, outcome, request context (ip, userAgent, requestId, traceId), target, and a free-form `metadata` bag that passes through the logger's redaction pipeline.
- **`AuditEntry`** — `AuditEvent` plus `timestamp` and `level`, added at emit time.
- **`AuditSink`** — a port (`(entry) => void`) for persisting entries so an admin endpoint can query them. Registered at boot; unregistered is a valid state (tests, queue workers).
- **`registerAuditSink(sink)`** — installs the sink; called once by the audit-logs module on registration. Must be fire-and-forget.
- **`emitAuditEvent(event)`** — writes the durable log line (info for success, warn for failure), then hands the entry to the sink if one is registered. A throwing sink is caught and logged as `audit.sink.failed` without affecting the request.
- **`extractRequestContext(context)`** — pulls ip, userAgent, requestId, and traceId from a `CallerContext` into the audit-event shape.
- **`buildAuditEvent(context, fields)`** — convenience builder that fills in actor role, request context, and other derived fields from the caller context; the caller only supplies `action`, `outcome`, and action-specific extras.
- **`resolveActorRole(context)`** (internal) — maps `CallerContext` to the four-way role split: `anonymous` → `system` → `admin` → `user`.

## Relationships

- **`logger.ts`** — imports `auditLogger`, the dedicated always-on Winston logger this module writes to.
- **`tracer.ts`** — imports `getActiveSpanContext` to attach the OTel trace id to each audit entry.
- **`audit-actions.generated.ts`** — source of `coreAuditActions`; itself produced by `scripts/docs/generate-audit-actions.ts` from a shared YAML definition.
- **`forbidden.ts` / `security-events.ts`** — sibling observability modules in the same directory; `forbidden` likely composes audit events for access-denied responses.
- **`authorizations.ts`, `origin.ts`, `rate-limit.ts`** — guard/middleware layers that call `buildAuditEvent` + `emitAuditEvent` for requests rejected before any domain module executes.
- **`role-audit.ts`, `account-deletion.ts`, `email-change.ts`, `caller.ts`, `staff-read.ts`** — domain modules that augment `AuditActionMap`, build `CallerContext`, or emit domain-specific audit events through this module's API.

## Notes

- `infrastructure` sits at the bottom of the dependency graph and **must not** import `@modules/*` or `@kernel/*`. The declaration-merging seam (`AuditActionMap`) is the mechanism that keeps this constraint while still giving a closed union type across all modules.
- The sink contract is absolute: no throwing, no rejecting. `emitAuditEvent` still wraps the call in try/catch as belt-and-braces. A broken sink degrades to a `warn` log line; it never fails the in-flight request.
- `actorScope` defaults to the tenant scope from `CallerContext`, but platform-key guards (e.g. `requirePermissionGuard`) must override it explicitly—`CallerContext` is always resolved in tenant scope by design.
- `actorRole` ordering in `resolveActorRole`: `system` is checked **before** `unrestricted` because `SYSTEM_ACTOR` is also unrestricted; without that check, background jobs would read as admin actions.
- The `metadata` field passes through the logger's redaction pipeline; anything sensitive should go there rather than a top-level field.
