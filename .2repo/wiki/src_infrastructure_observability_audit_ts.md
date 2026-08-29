# src/infrastructure/observability/audit.ts

## Purpose

Provides the audit-trail layer: a closed vocabulary of action identifiers, a structured event shape, and the emit/persist pipeline that records *who did what to which resource, and whether it succeeded*. It is deliberately separate from application logging — audit entries are a compliance artefact written to a dedicated always-on logger with a stable, machine-readable field set.

## Key elements

- **`coreAuditActions`** — Three app-level action constants (`security.unauthorized`, `security.forbidden`, `security.rate_limit_hit`). Emitted by `middlewares/authorizations.ts` for requests refused before any domain handler runs.
- **`AuditActionMap`** — Empty interface serving as a declaration-merging seam. Each module (e.g. `modules/account/audit.ts`) augments it with its own action strings, keeping the vocabulary closed and type-safe.
- **`AuditAction`** — Union of `CoreAuditAction | AuditActionMap[keyof AuditActionMap]`.
- **`AuditEvent`** — The structured event shape (snake_case fields: `actor_user_id`, `actor_role`, `action`, `outcome`, `ip`, `user_agent`, `request_id`, `trace_id`, `target_type`, `target_id`, `metadata`).
- **`AuditEntry`** — `AuditEvent` + `timestamp: Date` + `level: 'info' | 'warn'`, added at emit time.
- **`AuditSink`** / **`registerAuditSink`** — Port for a persistence callback (e.g. DB write). Installed once at module-load time by the audit-logs module. Unregistered is a valid state.
- **`emitAuditEvent(event)`** — Writes the log line via `auditLogger`, then invokes the registered sink. Swallows and logs any sink exception so a broken sink can never fail the in-flight request.
- **`extractRequestContext(context)`** — Pulls `ip`, `user_agent`, `request_id`, `trace_id` from `CallerContext` / active OTel span.
- **`resolveActorRole(context)`** — Derives `'admin' | 'user' | 'anonymous'` from the caller's admin flag and presence of an id.
- **`buildAuditEvent(context, fields)`** — Assembles a full `AuditEvent` from caller context plus action-specific fields. Caller overrides win for `actor_user_id`/`actor_role`; context-derived fields (`ip`, `trace_id`, …) are spread last and cannot be overridden.

## Relationships

- **`@infrastructure/adapters/logger`** — Imports `auditLogger`; every audit event is written through it as the durable, always-on log line.
- **`@infrastructure/observability/tracer`** — Imports `getActiveSpanContext` to stamp `trace_id` onto each event, linking audit entries to distributed traces.
- **`@infrastructure/http/request`** — Imports the `CallerContext` type; `buildAuditEvent`, `extractRequestContext`, and `resolveActorRole` all consume it.
- **`@kernel/middlewares/authorizations`** — Sole emitter of the three `coreAuditActions`; it calls `emitAuditEvent` when a request is denied before reaching domain code.
- **`@modules/account/*` (services, controllers)** — Call `buildAuditEvent` + `emitAuditEvent` for domain-specific actions (login, reset, verification, token cleanup, profile changes). Each module also augments `AuditActionMap` in its own `audit.ts`.
- **`@modules/account/tests/**`** — Unit tests exercise `buildAuditEvent`/`emitAuditEvent` in isolation (no sink registered); integration tests assert audit lines appear in service flows.

## Notes

- **Field names are snake_case** on purpose — they are log data consumed by SIEM tooling, not TypeScript identifiers. Do not "fix" them to camelCase.
- **`AuditActionMap` augmentation is type-only.** Infrastructure imports nothing from modules; a module's actions leave the `AuditAction` union the moment that module is removed.
- **Sink contract: must not throw, must not reject.** `emitAuditEvent` wraps the call in `try/catch` as a second line of defence, but the sink implementation itself is responsible for fire-and-forget semantics (the audit-log schema uses `bufferCommands: false`).
- **`ip` is the proxy/LB address** unless Express `trust proxy` is configured. Behind a load balancer, that setting is what makes the field meaningful for incident investigation.
- **`actor_user_id` fallback chain:** explicit override → `context.caller.id` → `'unknown'`. The override exists so a failed login can record the *attempted* email rather than an empty string.
- **Unregistered sink is normal.** Unit tests and queue workers run without one; the log line is still written and remains the compliance record.
