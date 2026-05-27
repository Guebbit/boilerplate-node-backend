# Winston & Audit Logs

## Two log streams

| Stream        | Purpose                                                               | Format                                          |
| ------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `logger`      | normal application logs (request access logs, errors, warnings)       | JSON in production/test, pretty + colour in dev |
| `auditLogger` | security/admin events (login attempts, role checks, token cleanup, …) | always JSON                                     |

Both write to **stdout**, which Docker captures. There is no Loki transport bundled — adding one later is a few lines in `src/utils/winston.ts`.

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

`emitAuditEvent` (in `src/utils/audit.ts`) is the only entry point for auditable actions. Each event has a stable `action` (`auth.login.succeeded`, `admin.user.deleted`, …), an `outcome` (`success` / `failure`), and a `level` derived from the outcome.

```json
{
    "level": "info",
    "log_type": "audit",
    "action": "auth.login.succeeded",
    "actor_user_id": "user-123",
    "actor_role": "user",
    "outcome": "success",
    "ip": "1.2.3.4",
    "request_id": "…",
    "trace_id": "…"
}
```

## Configuration

| Env var             | Effect                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `NODE_LOG_LEVEL`    | logger level (`error`, `warn`, `info`, `debug`, …). Defaults to `info` in production, `debug` elsewhere. |
| `NODE_SERVICE_NAME` | tag on every log entry. Useful when several services ship logs to the same aggregator.                   |

## Redaction

`redactSensitiveFields` replaces values of well-known sensitive keys (`password`, `token`, `cookie`, `authorization`, …) with `[REDACTED]` before logging. It runs on every log entry and on every audit event.

## Useful links

- [Winston docs](https://github.com/winstonjs/winston#readme)
- [Winston transports](https://github.com/winstonjs/winston/blob/master/docs/transports.md)
- [Winston-Loki transport](https://github.com/JaniAnttonen/winston-loki) — drop-in if you later want to ship logs to Loki
- [Grafana Loki overview](https://grafana.com/docs/loki/latest/get-started/overview/)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) — guidance for audit/security logs

## Related pages

- [OpenTelemetry](./opentelemetry.md)
- [Tempo](./tempo.md)
- [Grafana](./grafana.md)
