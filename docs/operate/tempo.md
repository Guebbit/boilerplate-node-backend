---
type: task
audience: [operator]
---

# Tempo

## What it is

[Grafana Tempo](https://grafana.com/oss/tempo/) is the **trace store** of this boilerplate.
Spans emitted by the app reach Tempo via the **OTel Collector** (not directly).

You query Tempo from Grafana — you do not query Tempo directly.

## How it is wired

```
App  →  OTel Collector (OTLP/HTTP :4318)  →  Tempo (OTLP/gRPC :4317)  →  Grafana
```

- The app exports OTLP/HTTP to the endpoint in `OTEL_EXPORTER_OTLP_ENDPOINT` (`http://otel-collector:4318` under compose); unset, trace export is off. `docker-compose.yml` passes the variable through from `.env`.
- The collector fans signals out to Tempo via internal gRPC.
- Tempo runs in single-binary mode with local filesystem storage (`docker/observability/tempo.config.yaml`).
- Grafana auto-provisions Tempo as the default datasource.

## Where to look

- Grafana UI: `http://localhost:3001` → **Explore** → **Tempo**.
- Search by `service.name = "api"` (the `NODE_SERVICE_NAME` default), by `trace_id`, by HTTP route, or by error.
- A span carries no personal data in clear: `client.address` and `network.peer.address` follow `NODE_LOG_PERSONAL_FIELDS` like a log line's `ip`: the same keyed digest by default (search by that digest, not by address), `[REDACTED]` in `redact` mode, the address itself in `plain`, `client.address` is the address Express resolves from `trust proxy` (`request.ip`), never the leftmost `X-Forwarded-For` entry a caller can write. `url.query` is rewritten only on a span whose query carried something to hide: the `code`, `state` and `email` parameters read `REDACTED` (the OTel `url.query` marker, without brackets; every other attribute and every log line uses `[REDACTED]`), and an email or IP address in the value of any other parameter is replaced by the same stand-in as `client.address`. A Redis span's `db.query.text` is the command name only (`INCR`), never its key, because a rate-limit key carries a caller's address. A 4xx leaves the server span's status unset; only a 5xx marks it as an error.

## Works with

- **[OpenTelemetry](./opentelemetry.md)** — the OTel SDK in the app generates the spans stored here. The OTel Collector receives them and forwards them to Tempo. → [Trace flow](./opentelemetry.md#trace-flow-with-otel-collector)
- **[Loki](./loki.md)** — every [Winston](./winston.md) log line carries the same `trace_id` as the spans here. In Grafana you can jump from a Loki log entry directly to this trace, or from a Tempo span to the surrounding log lines. → [Trace ↔ log correlation](./loki.md#trace-log-correlation)
- **[Grafana](./grafana.md)** — Tempo has no standalone UI. All trace exploration happens through Grafana → Explore → Tempo.

## External references

- [TraceQL query language](https://grafana.com/docs/tempo/latest/traceql/) — needed to write trace queries beyond simple `trace_id` lookups in [Grafana](./grafana.md)

## Related pages

- [Observability Reference](./observability-reference.md)
- [OpenTelemetry](./opentelemetry.md)
- [Grafana](./grafana.md)
