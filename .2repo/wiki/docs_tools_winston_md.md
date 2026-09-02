# docs/tools/winston.md

## Purpose

Documents the project's two Winston log streams (`logger` and `auditLogger`), their JSON schemas, redaction/personal-data handling, and the `emitAuditEvent` audit pipeline — so anyone adding a log call or audit action knows the contract without reading the source.

## Key elements

- **`logger`** — application log stream (access logs, errors, warnings). JSON in prod/test, pretty+colour in dev. Writes to stdout.
- **`auditLogger`** — security/admin event stream. Always JSON, always stdout.
- **`emitAuditEvent`** (`src/infrastructure/observability/audit.ts`) — sole entry point for auditable actions. Emits to both `auditLogger` (stdout → Loki) and a Mongo `auditlogs` collection (queryable via `GET /observability/audit`).
- **`IAuditActionMap`** — closed union of audit action strings. Each module declares its own actions in `src/modules/<name>/audit.ts` as an `as const` object and augments this map. `infrastructure` keeps only the three `security.*` actions.
- **`redactSensitiveFields`** — replaces values of known credential keys (`password`, `token`, `cookie`, `authorization`, …) with `[REDACTED]` on every log and audit entry.
- **`PERSONAL_FIELDS`** — separate list (`email`, `ip`, `phone`, `street`, `zip`, `fullName`) governed by `NODE_LOG_PERSONAL_FIELDS` (`hash` default, `redact`, or `plain`).
- **`IAuditSink`** — port registered in `app.ts` after DB connect; inverts the dependency so `src/infrastructure/**` never imports `@modules/*`.
- **Config env vars** — `NODE_LOG_LEVEL`, `NODE_SERVICE_NAME`, `NODE_LOG_PERSONAL_FIELDS`, `NODE_AUDIT_RETENTION_DAYS` (default 90; TTL index on Mongo).

## Relationships

- **`src/infrastructure/adapters/logger.ts`** (→ `src-infrastructure.md`) — contains the Winston logger setup; adding a Loki transport is a few lines here.
- **`src/infrastructure/observability/audit.ts`** (→ `src-infrastructure.md`) — defines `emitAuditEvent` and the `security.*` audit actions.
- **`src/modules/<name>/audit.ts`** (→ `src-modules.md`) — each module owns its audit actions and augments `IAuditActionMap`.
- **`tests/cross-cutting/audit-actions.test.ts`** (→ `tests.md`) — enforces no duplicate action strings and the dotted-naming convention.
- **`GET /observability/audit`** (→ `observability.md`, `audit-logs.md`) — the queryable Mongo copy behind the API endpoint.
- **Grafana / Tempo** (→ `grafana.md`) — the `trace_id` field on every log line is the join key for log→trace correlation.
- **`app.ts` / layer rules** (→ `architecture.md`, `layers.md`) — `IAuditSink` registration and the `infrastructure` → `modules` import ban.
- **`events-and-logging.md`** (→ sibling page) — explains how these streams fit alongside analytics events, metrics, and queue jobs.

## Notes

- **TTL index gotcha:** Changing `NODE_AUDIT_RETENTION_DAYS` does *not* update an existing Mongo TTL index. A `collMod` migration under `db/migrations/` is required; a restart is insufficient.
- **Mongo audit write failure is silent** — it logs a warning but never rejects the triggering request. The stdout/Loki path, by contrast, is the compliance record and a broken logger is a real incident.
- **Audit action vocabulary is a closed union, not free strings.** Alerts built on e.g. `auth.login` cannot be broken by a typo at a call site.
- **Personal-data hashing is deterministic** (sha256, 12 hex chars, `sha256:`-prefixed) so a trace remains followable across requests while remaining unreadable on its own.
- **No Loki transport is bundled.** Winston writes JSON to stdout; Promtail tails and ships. A `winston-loki` transport is listed as an optional drop-in.
