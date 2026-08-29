# docs/modules/audit-logs.md

## Purpose

Headless domain module that owns the queryable audit-trail collection and installs its sink at import time. It exists so that audit storage can be toggled as a unit without naming a domain from the assembly file (`app.ts`). No router is declared here; the single read endpoint lives in `observability`.

## Key elements

- **Import-time sink registration** — at module load, registers a `record` function as the sink for `@infrastructure/observability/audit`. The ~53 `emitAuditEvent` call sites in the app never import this module directly; they call the infrastructure layer, which dispatches to the sink only if one exists.
- **`record` function** — fire-and-forget write path; touches MongoDB only when an event actually fires (i.e., after the app is serving requests).
- **TTL index on `timestamp`** — `expireAfterSeconds: 7776000` (90 days). This is the sole mechanism that deletes old entries; there is no cron job.
- **Two compound indexes** — one supports "all actions by one actor" queries, the other "all actors who performed one action."

## Relationships

- **`docs/api/observability.md`** — the `observability` module owns `GET /observability/audit`, the only endpoint that reads this collection. Enabling this module without `observability` yields a stored trail nothing exposes, which is a valid build configuration, not an error.
- **`docs/api/endpoints.md`** — the endpoint catalog where `GET /observability/audit` is listed; the endpoint itself is defined and served by `observability`, not by this module.

## Notes

- **Field naming is `snake_case`** in the audit collection, unlike the `camelCase` convention used elsewhere in the codebase. The rationale: an audit row is a log record, not a domain document.
- **Deleting this module is safe at the build level** — everything else compiles; the only effect is that audit events stop being persisted.
- **Retention is a database fact, not application logic.** Changing the TTL on the `timestamp` index is the only way to alter how long entries are kept. There is no application-side cleanup.
- **The module declares no router.** This is intentional ("the headless half of the manifest") and is the reason it appears in the manifest without a corresponding route entry.
