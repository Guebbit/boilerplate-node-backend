---
source: src/infrastructure/observability/audit.ts
sha256: f5e95dad4d1c1ee72816e4c89aee8f605620a300513a7b4628fdfb0230fbc5c4
generated_at: 2026-09-27T14:13:02.774570+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/audit.ts

## Purpose

Defines the structured audit-trail event schema and the single emission pipeline for security/compliance logging. It is deliberately separated from application logging so that audit records use a stable, machine-readable field set (snake_case, SIEM-friendly) that must not be reshaped for convenience.

## Key elements

- **`coreAuditActions`** — Four app-level action constants (`security.unauthorized`, `security.forbidden`, `security.rate_limit_hit`, `security.reauth_required`) emitted for requests refused before any domain module sees them.
- **`AuditActionMap`** — Empty interface serving as a declaration-merging seam; each domain module (e.g. `modules/account/audit.ts`) augments it with its own action strings. Infrastructure never imports from a module.
- **`AuditAction`** — Union of `CoreAuditAction` and all module-declared actions.
- **`AuditEvent`** — The structured event interface (actor, action, outcome, target, request context, metadata).
- **`AuditEntry`** — `AuditEvent` plus `timestamp` and derived `level` (`info`/`warn`), added at emit time.
- **`AuditSink`** — `(entry: AuditEntry) => void`; a persistence callback port supplied at boot so infrastructure need not import a database layer.
- **`registerAuditSink`** — Installs the sink; called once by the audit-logs module's `onRegistered`.
- **`emitAuditEvent`** — Writes the durable log line via `auditLogger`, then calls the sink (fire-and-forget, wrapped in try/catch).
- **`extractRequestContext`** — Pulls `ip`, `user_agent`, `request_id`, `trace_id` from a `CallerContext`.
- **`resolveActorRole`** *(internal)* — Maps caller context to `'anonymous' | 'user' | 'admin'`.
- **`buildAuditEvent`** — Assembles a complete `AuditEvent` from a `CallerContext` plus action/outcome and optional overrides.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `auditLogger`, the dedicated always-on winston logger that receives every audit line.
- **`src/infrastructure/observability/tracer.ts`** — Imports `getActiveSpanContext` to attach the OTel `trace_id` to each event.
- **`src/kernel/middlewares/authorizations.ts`** — Primary caller of `emitAuditEvent` for the four `coreAuditActions`; also the caller that overrides `actor_scope` for platform-key checks.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Emits `SECURITY_RATE_LIMIT_HIT` when a client exceeds the limit.
- **`src/modules/access/service.ts`, `src/modules/account/services/*`** — Augment `AuditActionMap` with domain actions and call `buildAuditEvent` / `emitAuditEvent` for their respective operations.
- **`src/modules/access/tests/integration/access.test.ts`** — Integration tests that assert audit events are emitted with correct fields.
- **`scripts/docs/generate-audit-actions.ts`** — Consumes the action constants/map to generate reference documentation.

## Notes

- Field names are **snake_case** (not the codebase's usual camelCase) because they are consumed by SIEM/log tooling, not by TypeScript callers.
- `AuditSink` is a port, not a direct DB call: infrastructure sits at the bottom of the dependency graph and cannot import `@modules/*`. The implementation is injected at boot via `registerAuditSink`.
- The sink contract is **MUST NOT throw/reject**; `emitAuditEvent` still wraps the call in try/catch as a safety net. A sink failure must never fail the in-flight request.
- `auditSink` being `undefined` is a valid state (unit tests, queue workers) — the log line is still written regardless.
- `actor_scope` defaults to `'tenant'` (derived from `context.caller.scope`). Platform-key guards must override it explicitly, or every platform refusal is mis-recorded as a tenant one.
- `ip` reflects the proxy address unless Express `trust proxy` is configured; behind a load balancer that setting is what makes the field meaningful.
- `resolveActorRole` reads `context.caller.unrestricted` (computed in `kernel/permissions.ts`) rather than re-deriving the full key-set check.
- Delete a module and its actions drop out of the `AuditAction` union automatically — no central registry to maintain.
