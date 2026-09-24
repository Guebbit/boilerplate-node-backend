---
source: src/infrastructure/observability/audit.ts
sha256: 61489507aaaba682db16b6d2260c401fc6fef4fdac6ef99d4c9fb6549924d908
generated_at: 2026-09-23T17:48:33.037625+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/audit.ts

## Purpose

Provides the structured audit-trail mechanism for the application. It is deliberately separate from application logging: audit entries are a security/compliance artefact written to a dedicated always-on logger with a stable, machine-readable field set. The module defines the event shape, the emit path, and a fire-and-forget persistence sink, so that "who did what to which resource, and did it work" is recorded independently of operational logs.

## Key elements

- **`coreAuditActions`** — `as const` object holding the four app-level action strings (`security.unauthorized`, `security.forbidden`, `security.rate_limit_hit`, `security.reauth_required`). These live here because the authorizations middleware emits them before any domain module is reached.
- **`AuditActionMap`** — Empty interface intended for TypeScript declaration merging; each domain module (e.g. `modules/account/audit.ts`) augments it with its own action strings so the infrastructure layer never imports from a module.
- **`AuditAction`** — Union of `CoreAuditAction` and all keys of `AuditActionMap`.
- **`AuditEvent`** — The core record interface (snake_case fields). Mandatory: `actor_user_id`, `actor_role`, `action`, `outcome`. Optional: `actor_role_name`, `actor_credential_id`, `actor_scope`, `ip`, `user_agent`, `request_id`, `trace_id`, `target_type`, `target_id`, `metadata`.
- **`AuditEntry`** — `AuditEvent` plus `timestamp: Date` and `level: 'info' | 'warn'`, added at emit time.
- **`AuditSink`** — Type `(entry: AuditEntry) => void`; a port for persistence. Implementations must not throw or reject.
- **`registerAuditSink`** — Installs the sink. Called once at module-load time from `@modules/audit-logs/module`. Unregistered is a valid state (unit tests, queue workers).
- **`emitAuditEvent`** — Writes the durable log line via `auditLogger`, then forwards the entry to the registered sink inside a `try/catch` so a misbehaving sink cannot break the request.
- **`extractRequestContext`** — Pulls `ip`, `user_agent`, `request_id`, `trace_id` from a `CallerContext` (trace id via `getActiveSpanContext()`).
- **`resolveActorRole`** (internal) — Maps `CallerContext` to `'anonymous' | 'admin' | 'user'` using `context.caller.id` and `context.caller.unrestricted`.
- **`buildAuditEvent`** — Ergonomic factory that fills in derived context fields and applies caller overrides, returning a complete `AuditEvent`. Call sites only supply `action`, `outcome`, and action-specific extras.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `auditLogger`; the dedicated always-on Winston logger that audit entries are written to.
- **`src/infrastructure/observability/tracer.ts`** — Imports `getActiveSpanContext` to attach the OTel trace id to each audit event.
- **`src/kernel/middlewares/authorizations.ts`** — Primary emitter of the four `coreAuditActions` (unauthorized, forbidden, reauth_required). It is the one caller that explicitly overrides `actor_scope` for platform-key checks.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Emits `SECURITY_RATE_LIMIT_HIT` when a client exceeds its quota.
- **`src/modules/account/services/*`** (authentication, two-factor, verification, oauth, profile, export, token-cleanup) — Domain emitters that call `buildAuditEvent`/`emitAuditEvent` for their own actions (declared via their module's `AuditActionMap` augmentation).
- **`src/modules/access/service.ts`** — Audits access-control decisions (grant/deny) using the audit module.
- **`src/infrastructure/surfaces/create-delete-controller.ts`** — Audits resource create/delete operations.
- **`src/modules/account/tests/integration/access.test.ts`** — Integration tests that assert audit entries are emitted with the correct fields.

## Notes

- **snake_case field names** are intentional: these are log _data_ consumed by SIEM/log tooling, not TypeScript callers. Do not rename to camelCase.
- **`actor_scope` defaults to `'tenant'`** because `CallerContext.caller` is always resolved in tenant scope. A platform-key guard _must_ override it explicitly, or the event misrecords the scope.
- **`actor_user_id` is never omitted** — it is `'unknown'` when unresolvable, so log-backend queries can rely on the field always being present.
- **Declaration-merging seam**: `AuditActionMap` is intentionally empty in this file. Removing a module removes its actions from the `AuditAction` union automatically; there is no central registry to update.
- **Sink is fire-and-forget**: `registerAuditSink` is called at module import (not at DB connect), so the sink must tolerate being invoked while the connection is down. The `try/catch` in `emitAuditEvent` is the safety net for a sink that violates the no-throw contract.
- **`ip` reflects the proxy address** unless Express `trust proxy` is configured. Behind a load balancer, that setting determines whether the field is meaningful.
- **`unrestricted` flag**: The admin/user split is read off `context.caller.unrestricted` (computed once in `kernel/permissions.ts`); infrastructure does not re-derive key ownership.
