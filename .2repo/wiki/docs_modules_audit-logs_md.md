# docs/modules/audit-logs.md

## Purpose

Owns the `auditlogs` MongoDB collection and installs the write-sink (`record`) that ~53 `emitAuditEvent` call sites reach through `@infrastructure/observability/audit`. It declares no router; its sole responsibility is to store audit entries and enforce the 90-day retention window via a TTL index.

## Key elements

- **`record`** — fire-and-forget write function registered as the audit sink at module import time; only touches Mongo when an entry actually fires.
- **TTL index on `timestamp`** — `expireAfterSeconds: 7776000` (90 days); the only mechanism deleting old entries.
- **Two compound indexes** — one for "everything an actor did," one for "everyone who did a thing."
- **Sink installation** — the module registers itself with `@infrastructure/observability/audit` at import; no other file imports this module.

## Relationships

- **`docs/modules/observability.md`** — owns `GET /observability/audit`, the only read endpoint over this collection. Enabling audit-logs without observability yields a trail nothing exposes.
- **`docs/tools/winston.md`** — defines the action names and log structure that end up as audit rows.
- **`docs/tools/mongodb-mongoose.md`** — TTL index mechanism that enforces the retention window.
- **`docs/theory/modules.md`** — documents the "headless half of the manifest" pattern this module exemplifies (a module that owns a domain but exposes no router).

## Notes

- **No importers.** Nothing in the codebase `import`s this module. It works by installing a sink at import time, the same way a routed module hands over a router. Deleting the file stops audit storage; the rest of the app still builds.
- **`snake_case` field names** in the collection, unlike the `camelCase` convention used for domain documents elsewhere. The rationale: an audit row is a log record, not a domain document.
- **Retention is not a cron job.** It is enforced entirely by the Mongo TTL index. Changing the window means changing `expireAfterSeconds`; there is no application-level cleanup.
- **Enabling audit-logs without observability is valid.** You get a stored trail with no UI. It is not a misconfiguration.
