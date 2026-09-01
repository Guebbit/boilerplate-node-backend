# Winston & Audit Logs

## Two log streams

| Stream        | Purpose                                                               | Format                                          |
| ------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `logger`      | normal application logs (request access logs, errors, warnings)       | JSON in production/test, pretty + colour in dev |
| `auditLogger` | security/admin events (login attempts, role checks, token cleanup, …) | always JSON                                     |

Both write to **stdout**, which Docker captures. There is no Loki transport bundled — adding one later is a few lines in `src/infrastructure/adapters/logger.ts`.

## What an access log looks like

One slim line per request, only the fields that actually help:

```json
{
    "level": "info",
    "message": "GET /products 200 12.4ms",
    "request_id": "1b2c3d…",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "method": "GET",
    "route": "/products",
    "status_code": 200,
    "duration_ms": 12.4
}
```

The `trace_id` is the bridge to Grafana → Tempo: paste it in Explore to see the full request timeline, every DB query, every error attribute.

## What an error log looks like

One line per error, no stack trace bloat — the stack lives on the OTel span:

```json
{
    "level": "error",
    "message": "ValidationError: name is required",
    "request_id": "1b2c3d…",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "status": 422
}
```

## Audit events

`emitAuditEvent` (in `src/infrastructure/observability/audit.ts`) is the only entry point for auditable actions. Each event has a stable `action` (`auth.login`, `admin.user.erased`, …), an `outcome` (`success` / `failure`), and a `level` derived from the outcome.

```json
{
    "level": "info",
    "log_type": "audit",
    "action": "auth.login",
    "actor_user_id": "user-123",
    "actor_role": "user",
    "outcome": "success",
    "ip": "1.2.3.4",
    "request_id": "…",
    "trace_id": "…"
}
```

The `action` vocabulary is a closed union, not free strings — an alert built on
`auth.login` cannot be defeated by a typo at a call site.

It is assembled rather than declared in one place. Each module owns its own actions in
`src/modules/<name>/audit.ts` as an `as const` object and augments core's `IAuditActionMap`, the
same way modules declare domain events; `infrastructure` keeps only the three `security.*` actions emitted by
the authorization middleware about requests that never reached a domain. So the union narrows when
you delete a module, and `infrastructure` never names one. `tests/cross-cutting/audit-actions.test.ts` is
what keeps two modules from claiming the same string, or inventing one that breaks the dotted
convention log backends filter on.

### Where an audit entry ends up

Two destinations, from the single `emitAuditEvent` call:

| Destination            | Role                                                              | Fails how                                                     |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `auditLogger` → stdout | the compliance record — append-only, shipped to [Loki](./loki.md) | a broken logger is a real problem                             |
| Mongo `auditlogs`      | the queryable copy behind `GET /observability/audit`              | silently, into a warning — never fails the triggering request |

The Mongo write goes through an `IAuditSink` port that `app.ts` registers after the database
connects. `src/infrastructure/**` may not import `@modules/*`, so the dependency is inverted rather
than smuggled — and the 53 `emitAuditEvent` call sites know about neither destination.

Before this, the endpoint read a 200-entry in-process ring buffer. It could not answer
"what has this user done": 200 entries **in total** across every actor, a different slice in each
cluster worker, and empty after a restart.

### Retention

| Env var                     | Effect                                                                     |
| --------------------------- | -------------------------------------------------------------------------- |
| `NODE_AUDIT_RETENTION_DAYS` | how long the Mongo copy survives before its TTL index removes it (def. 90) |

Only the queryable copy expires — log retention is [Loki](./loki.md)'s business.

::: warning Changing the retention window
Mongo will not alter an existing TTL index's `expireAfterSeconds`. On a database that already has
the index, changing `NODE_AUDIT_RETENTION_DAYS` does nothing until a `collMod` migration under
`db/migrations/` runs. A restart will not apply it.
:::

## Configuration

| Env var                    | Effect                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NODE_LOG_LEVEL`           | logger level (`error`, `warn`, `info`, `debug`, …). Defaults to `info` in production, `debug` elsewhere. |
| `NODE_SERVICE_NAME`        | tag on every log entry. Useful when several services ship logs to the same aggregator.                   |
| `NODE_LOG_PERSONAL_FIELDS` | `hash` (default), `redact`, or `plain` — see [Personal data](#personal-data) below.                      |

## Redaction

`redactSensitiveFields` replaces values of well-known sensitive keys (`password`, `token`, `cookie`, `authorization`, …) with `[REDACTED]` before logging. It runs on every log entry and on every audit event.

## Personal data

A second, separate list — `PERSONAL_FIELDS` (`email`, `ip`, `phone`, `street`, `zip`, `fullName`) — covers fields that are personal data without being credentials. Data minimisation applies to logs the same as it applies to collections, and these flow into Winston, and from there into [Loki](./loki.md), same as everything else.

Kept apart from `SENSITIVE_FIELDS` on purpose: a credential is always replaced outright, never kept in any form. A personal field defaults to **hashed** instead (`NODE_LOG_PERSONAL_FIELDS=hash`, sha256, truncated to 12 hex characters, `sha256:`-prefixed) — the same input always produces the same digest, so a trace stays followable ("did this user's requests all fail the same way") without the log line being readable on its own. `redact` drops it entirely, like a credential; `plain` leaves it untouched, for local development where the log never leaves the machine.

The private setting (`hash`) is the default deliberately: a boilerplate's default config is the one most deployments never revisit.

## Works with

- **[OpenTelemetry](./opentelemetry.md)** — the OTel SDK automatically injects the active `trace_id` into Winston's logging context on every request. You write nothing; every log line just has it. → full explanation: [How logs and traces correlate](./opentelemetry.md#how-logs-and-traces-correlate)
- **[Loki](./loki.md)** — Winston writes JSON to stdout; Promtail tails those lines and ships them to Loki. The `trace_id` on each line is what enables jumping from a log entry straight to a Tempo trace. → [Trace ↔ log correlation](./loki.md#trace-log-correlation)

## External references

- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) — guidance for what audit/security logs should capture
- [winston-loki transport](https://github.com/JaniAnttonen/winston-loki) — drop-in if you want to push logs directly to [Loki](./loki.md) instead of via Promtail

## Related pages

- [Events & Logging](./events-and-logging.md) — how these two streams relate to analytics, metrics and queue jobs
- [OpenTelemetry](./opentelemetry.md)
- [Tempo](./tempo.md)
- [Grafana](./grafana.md)
