# Tempo

## What it is

[Grafana Tempo](https://grafana.com/oss/tempo/) is the **trace store** of this boilerplate.
It is the place that keeps the spans the app emits via OpenTelemetry.

You query it from Grafana — you do not query Tempo directly.

## Why Tempo (not Prometheus, not Loki)

| Tool       | Stores                        | Used here?                                                 |
| ---------- | ----------------------------- | ---------------------------------------------------------- |
| Prometheus | numeric time-series (metrics) | optional — `/metrics` is exposed                           |
| Loki       | log lines                     | not bundled — `docker logs` is enough until you outgrow it |
| **Tempo**  | **traces (spans)**            | **yes — this is the wired-up signal**                      |

A single trace is much more useful than a fat log object when something breaks: you see the full request timeline, every DB query, every Redis call, with timings and error attributes attached.

## How it is wired

- The app exports OTLP/HTTP to `http://tempo:4318` (set in `docker-compose.yml`).
- Tempo runs in single-binary mode with local filesystem storage (`.docker/observability/tempo.yaml`).
- Grafana auto-provisions Tempo as the default datasource.

## Where to look

- Grafana UI: `http://localhost:3001` → **Explore** → **Tempo**.
- Search by `service.name = "api"`, by `trace_id`, by HTTP route, or by error.

## Useful links

- [Tempo documentation](https://grafana.com/docs/tempo/latest/)
- [TraceQL query language](https://grafana.com/docs/tempo/latest/traceql/)
- [Tempo single-binary deployment](https://grafana.com/docs/tempo/latest/setup/deployment/#monolithic-mode)
- [Tempo configuration reference](https://grafana.com/docs/tempo/latest/configuration/)

## Related pages

- [OpenTelemetry](./opentelemetry.md)
- [Grafana](./grafana.md)
