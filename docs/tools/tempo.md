# Tempo

## What it is

[Grafana Tempo](https://grafana.com/oss/tempo/) is the **trace store** of this boilerplate.
Spans emitted by the app reach Tempo via the **OTel Collector** (not directly).

You query Tempo from Grafana — you do not query Tempo directly.

## How it is wired

```
App  →  OTel Collector (OTLP/HTTP :4318)  →  Tempo (OTLP/gRPC :4317)  →  Grafana
```

- The app exports OTLP/HTTP to `http://otel-collector:4318` (set in `docker-compose.yml`).
- The collector fans signals out to Tempo via internal gRPC.
- Tempo runs in single-binary mode with local filesystem storage (`.docker/observability/tempo.config.yaml`).
- Grafana auto-provisions Tempo as the default datasource.

## Where to look

- Grafana UI: `http://localhost:3001` → **Explore** → **Tempo**.
- Search by `service.name = "api"`, by `trace_id`, by HTTP route, or by error.

## Works with

- **[OpenTelemetry](./opentelemetry.md)** — the OTel SDK in the app generates the spans stored here. The OTel Collector receives them and forwards them to Tempo. → [Trace flow](./opentelemetry.md#trace-flow-with-otel-collector)
- **[Loki](./loki.md)** — every [Winston](./winston.md) log line carries the same `trace_id` as the spans here. In Grafana you can jump from a Loki log entry directly to this trace, or from a Tempo span to the surrounding log lines. → [Trace ↔ log correlation](./loki.md#trace--log-correlation)
- **[Grafana](./grafana.md)** — Tempo has no standalone UI. All trace exploration happens through Grafana → Explore → Tempo.

## External references

- [TraceQL query language](https://grafana.com/docs/tempo/latest/traceql/) — needed to write trace queries beyond simple `trace_id` lookups in [Grafana](./grafana.md)

## Related pages

- [Observability Reference](./observability-reference.md)
- [OpenTelemetry](./opentelemetry.md)
- [Grafana](./grafana.md)
