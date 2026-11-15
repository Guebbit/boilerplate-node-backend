---
source: src/infrastructure/observability/audit.ts
sha256: 29baf8dd1633c5c4034afb734bb867f30ec55d8fcb2d7d0b0467e9d2d36a6d3c
generated_at: 2026-11-14T18:11:49.417985+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/audit.ts

## Purpose

Defines the application's audit trail: a structured, machine-readable record of "who did what to which resource, and did it work." It is deliberately decoupled from application logging — audit entries are security/compliance artefacts written to a dedicated always-on logger with a stable field set, and optionally persisted through a sink for admin queryability.

## Key elements

- **`coreAuditActions`** (re-exported from `./audit-actions.generated`) — app-level action constants in `domain.resource.verb` dot-notation, used by guards that reject requests before any domain module sees them.
- **`AuditActionMap`** — an empty interface intended for declaration merging; each domain module augments it with its own action strings so `infrastructure` never imports a module.
- **`AuditAction`** — union of `CoreAuditAction | AuditActionMap[keyof AuditActionMap]`; the full set of emittable actions.
- **`AuditEvent`** — the structured event schema (`actorUserId`, `actorRole`, `actorRoleName`, `actorCredentialId`, `actorScope`, `action`, `outcome`, `ip`, `userAgent`, `requestId`, `traceId`, `targetType`, `targetId`, `subjectId`, `metadata`).
- **`AuditEntry`** — `AuditEvent` + `timestamp` + `level`; the shape handed to the persistence sink.
- **`AUDIT_ACTOR_ROLES` / `AUDIT_OUTCOMES` / `AUDIT_LEVELS`** — constant arrays derived from the schema enums, for programmatic reference.
- **`AuditSink`** (type) / **`registerAuditSink()`** — port for a fire-and-forget persistence callback; installed once at module registration.
- **`emitAuditEvent(event)`** — the single emission point: scrubs credentials from `metadata`, writes the log line via `auditLogger`, then invokes the sink (wrapped in a try/catch so a misbehaving sink cannot crash the request).
- **`extractRequestContext(context)`** — pulls `ip`, `userAgent`, `requestId`, `traceId` from a `CallerContext` for use in an audit event.
- **`resolveActorRole(context)`** (private) — maps `CallerContext` to the four-way `anonymous | user | admin | system` split; checks `system` before `unrestricted` so background jobs aren't misread as admin actions.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — imports `auditLogger` (the dedicated always-on logger) and `redactCredentials` (credential scrubbing applied to `metadata` at emit time).
- **`src/infrastructure/observability/span-context.ts`** — imports `getActiveSpanContext` to attach the OTel `traceId` to each audit entry.
- **`scripts/docs/generate-audit-actions.ts`** — the build script that produces the generated action-constants file this module imports; its output defines the `coreAuditActions` set.
- **`src/kernel/middlewares/authorizations.ts`** — `requirePermissionGuard` (the authorization guard) is a primary caller of `emitAuditEvent` and the one caller that overrides `actorScope` for platform-key checks.
- **`src/kernel/staff-read.ts`** — sets the `subjectId` field on audit events when a staff member reads another person's record.
- **`src/modules/account/services/caller.ts`** — builds the `CallerContext` that `extractRequestContext` and `resolveActorRole` consume.
- **`src/modules/access/services/role-audit.ts`** — a domain module that augments `AuditActionMap` and emits audit events for role-related actions.

## Notes

- **Dependency direction is strict:** `infrastructure` may not import `@modules/*` or `@kernel/*`. Modules that need audit emit events via the public API of this file; the sink is injected at boot by the `audit-logs` module, not imported.
- **Sink contract:** the registered sink MUST NOT throw or reject. `emitAuditEvent` wraps the call in a try/catch as a belt-and-braces guarantee that a broken sink cannot fail the in-flight request or suppress the already-written log line.
- **Unregistered sink is valid:** unit tests and queue workers import this module without a database; the log line is still written either way.
- **`actorScope` default vs. override:** it defaults to `context.caller.scope` (always tenant), but platform-key guard checks must pass the scope they actually resolved, or platform refusals will be misrecorded as tenant events.
- **`resolveActorRole` ordering:** `system` is checked before `unrestricted` because `SYSTEM_ACTOR` is unrestricted; reversing the check would label every background job as an admin action.
- **`ip` accuracy** depends on Express `trust proxy` being configured behind a load balancer; otherwise it records the proxy address.
- **Credential scrubbing** (`redactCredentials`) is applied once at emit time so the log line and the stored row share the same scrubbed `metadata`; personal fields are left raw in the row and handled by the logger's own pipeline for the log line.
