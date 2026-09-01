# src/infrastructure/observability/audit.ts

## Purpose

Defines the application's structured audit-trail system — a security/compliance artefact deliberately separated from general application logging. It provides the event schema, action-constant namespace, and the emit/persist pipeline that every module uses to record *who did what to which resource, and whether it succeeded*, via a dedicated `auditLogger` stream and an optional persistence sink.

## Key elements

- **`coreAuditActions`** — Three app-level action constants (`security.unauthorized`, `security.forbidden`, `security.rate_limit_hit`) emitted by middleware before any domain module sees the request.
- **`AuditActionMap`** — An intentionally empty interface; each module augments it via TypeScript declaration merging (same pattern as `DomainEventMap`) so `infrastructure` never imports a module.
- **`AuditAction`** — Union of the three core strings and whatever the enabled modules declare; deleting a module drops its actions from the union.
- **`AuditEvent`** — The structured event shape (snake_case fields: `actor_user_id`, `actor_role`, `action`, `outcome`, `ip`, `user_agent`, `request_id`, `trace_id`, `target_type`, `target_id`, `metadata`).
- **`AuditEntry`** — `AuditEvent` plus `timestamp` and `level`, added at emit time.
- **`AuditSink` / `registerAuditSink`** — Port interface and one-time installer for a persistence callback; unregistered is a valid state (tests, queue workers).
- **`emitAuditEvent`** — Synchronous emitter: writes the log line via `auditLogger`, then fire-and-forget calls the sink (with a catch-all so a misbehaving sink cannot crash the request).
- **`extractRequestContext`** — Pulls `ip`, `user_agent`, `request_id`, `trace_id` from a `CallerContext`.
- **`resolveActorRole`** — Maps caller context to `'admin' | 'user' | 'anonymous'` (most-privileged check first).
- **`buildAuditEvent`** — Assembles a complete `AuditEvent` from `CallerContext` + caller-supplied fields; context-derived fields are spread last so they cannot be overridden.

## Relationships

- **`src/infrastructure/adapters/logger.ts`** — Imports `auditLogger`, the dedicated always-on Winston logger that audit lines are written to.
- **`src/infrastructure/observability/tracer.ts`** — Imports `getActiveSpanContext` to attach the OTel `trace_id` to each audit event.
- **`src/infrastructure/http/request.ts`** — Imports the `CallerContext` type used by all builder helpers.
- **`src/kernel/middlewares/authorizations.ts`** — Emits `security.unauthorized` / `security.forbidden` events via `emitAuditEvent`.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Emits `security.rate_limit_hit` events.
- **`src/modules/account/controllers/post-login.ts`, `post-reset-request.ts`**, and account services (`authentication.ts`, `verification.ts`, `profile.ts`, `token-cleanup.ts`) — Consumers that call `buildAuditEvent` / `emitAuditEvent` and augment `AuditActionMap` with domain-specific actions.
- **`src/infrastructure/surfaces/create-delete-controller.ts`** — Emits audit events for resource CRUD operations.
- **`src/modules/account/tests/unit/audit.test.ts`**, **`service-flows.test.ts`**, **`self-service.test.ts`** — Unit and integration tests exercising the emit/build path.

## Notes

- Field names are **snake_case** deliberately (they are SIEM/log-tooling data, not TS API); the rest of the codebase uses camelCase.
- `infrastructure` sits at the bottom of the dependency graph and **cannot import from `@modules/*` or `@kernel/*`**; the `AuditSink` port and `AuditActionMap` declaration-merging exist to keep that boundary intact.
- `registerAuditSink` is called at **module-load time** (not DB-connect time) from `@modules/audit-logs/module`, so the sink implementation must tolerate a disconnected database.
- `emitAuditEvent` is fully **synchronous** (`void`); the sink contract forbids throwing, and the `try/catch` is a safety net for a sink that breaks that contract.
- `actor_user_id` is **never omitted** — it defaults to `'unknown'` so downstream queries can rely on its presence.
- `ip` reflects the **proxy/LB address** unless Express `trust proxy` is configured; behind a load balancer that setting is what makes the field meaningful.
- The `action` string doubles as the Winston log **message**, so log backends can filter/grep on it directly.
