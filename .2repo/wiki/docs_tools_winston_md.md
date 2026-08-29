# docs/tools/winston.md

## Purpose

Documents the two Winston log streams (application `logger` and `auditLogger`), their JSON formats, configuration env vars, redaction rules, and how audit events are captured, persisted, and retained. Exists so developers know *where* to log, *what shape* each line takes, and *where* the data ends up without re-reading the adapter code.

## Key elements

- **`logger` / `auditLogger`** — the two streams. `logger` is JSON in prod/test, pretty + colour in dev; `auditLogger` is always JSON. Both write to stdout (captured by Docker → Promtail → Loki).
- **`emitAuditEvent`** (`src/infrastructure/observability/audit.ts`) — sole entry point for auditable actions. Accepts a closed-union `action`, an `outcome`, and actor metadata. Fans out to `auditLogger` (stdout) and the Mongo `auditlogs` collection via an `IAuditSink` port.
- **Per-module audit actions** (`src/modules/<name>/audit.ts`) — each module declares its own `as const` action object and augments core's `IAuditActionMap`. `infrastructure` owns only the three `security.*` actions.
- **`redactSensitiveFields`** — strips values of keys like `password`, `token`, `cookie`, `authorization` to `[REDACTED]` on every log/audit entry.
- **`IAuditSink`** — port registered in `app.ts` after DB connect; inverts the dependency so `src/infrastructure/**` never imports `@modules/*`.
- **Env vars** — `NODE_LOG_LEVEL`, `NODE_SERVICE_NAME`, `NODE_AUDIT_RETENTION_DAYS` (Mongo TTL, default 90 days).
- **`tests/cross-cutting/audit-actions.test.ts`** — enforces no duplicate action strings and validates the dotted naming convention.

## Relationships

- **`docs/tools/loki.md`** — Loki is the aggregation destination; Promtail tails stdout. Trace↔log correlation via `trace_id` is documented there. Log retention policy is Loki's, not Winston's.
- **`docs/tools/grafana.md`** — `trace_id` on every log line is the join key into Grafana → Tempo for full request timelines.
- **`docs/tools/events-and-logging.md`** — explains how these two streams sit alongside analytics events, metrics, and queue-job logs.
- **`docs/api/observability.md`** — `GET /observability/audit` reads the Mongo `auditlogs` collection (the queryable copy written by `IAuditSink`).
- **`docs/modules/audit-logs.md`** — the module that exposes the audit-log query endpoint backed by the Mongo collection.
- **`docs/reference/src-infrastructure.md`** — `src/infrastructure/adapters/logger.ts` (Winston setup) and `src/infrastructure/observability/audit.ts` (audit module) both live here.
- **`docs/reference/src-modules.md`** — per-module `audit.ts` files live under `src/modules/<name>/`.
- **`docs/reference/tests.md`** — `tests/cross-cutting/audit-actions.test.ts` guards the action vocabulary.
- **`docs/theory/layers.md`** — the `IAuditSink` inversion exists because the layering rule forbids `src/infrastructure/**` from importing `@modules/*`.
- **`docs/theory/request-flow.md`** — the OTel SDK injects the active `trace_id` into Winston's logging context per request; the flow doc describes where that happens.

## Notes

- **TTL changes require a migration.** Mongo does not alter an existing TTL index's `expireAfterSeconds` on the fly. Changing `NODE_AUDIT_RETENTION_DAYS` does nothing until a `collMod` migration under `db/migrations/` runs — a plain restart is insufficient.
- **Mongo write failures are silent.** A broken `IAuditSink` logs a warning and the request continues. The stdout `auditLogger` line is the authoritative compliance record; the Mongo copy is best-effort for querying.
- **No Loki transport is bundled.** Logs flow stdout → Promtail → Loki. Adding a direct `winston-loki` transport would be a few lines in the adapter but is intentionally not done.
- **`action` is a closed union, not a free string.** The `as const` + module-augmentation pattern means a typo at a call site is a compile error, and deleting a module narrows the union automatically.
