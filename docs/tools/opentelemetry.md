# OpenTelemetry

## Why it is here

OpenTelemetry (OTel) is the **trace** layer of this boilerplate.
A trace is the timeline of a single request: HTTP in, every Mongoose query, every Redis call, the response out.
When something is slow or breaks, a trace tells you _what happened and where_ — much more than a log line can.

We use OTel **auto-instrumentation**: there is no per-request code to write.

## What is instrumented out of the box

| Library     | Source                                                                                                             | Spans you get                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| HTTP server | [`@opentelemetry/instrumentation-http`](https://www.npmjs.com/package/@opentelemetry/instrumentation-http)         | one root span per incoming request           |
| Express     | [`@opentelemetry/instrumentation-express`](https://www.npmjs.com/package/@opentelemetry/instrumentation-express)   | one child span per route handler/middleware  |
| Mongoose    | [`@opentelemetry/instrumentation-mongoose`](https://www.npmjs.com/package/@opentelemetry/instrumentation-mongoose) | one child span per query (`find`, `save`, …) |
| Redis       | [`@opentelemetry/instrumentation-redis`](https://www.npmjs.com/package/@opentelemetry/instrumentation-redis)       | one child span per Redis command             |

All of this is wired in `src/utils/tracing.ts`.

## Configuration

| Env var                       | Effect                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP base URL of the collector (Tempo). When unset, traces are simply not exported. |
| `OTEL_EXPORTER_OTLP_HEADERS`  | Optional `key=value,key=value` for auth/tenant headers.                                  |
| `NODE_SERVICE_NAME`           | The `service.name` resource attribute used by Tempo/Grafana (default `api`).             |

Local docker-compose sets `OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318` automatically.

## Trace flow

```mermaid
flowchart LR
    Client --> HTTP[HTTP request]
    HTTP --> SDK[OTel SDK]
    SDK --> Express[Express handler]
    SDK --> DB[Mongoose query]
    SDK --> Redis[Redis command]
    SDK --> Tempo[Tempo via OTLP]
    Tempo --> Grafana[Grafana trace view]
```

## How logs and traces correlate

Every slim access log and every error log carries a `trace_id` field.
Copy that ID into Grafana → Explore → Tempo to jump straight to the trace for that request.

## Useful links

- [OpenTelemetry concepts](https://opentelemetry.io/docs/concepts/)
- [Traces & spans](https://opentelemetry.io/docs/concepts/signals/traces/)
- [JavaScript SDK getting started](https://opentelemetry.io/docs/languages/js/getting-started/nodejs/)
- [Node SDK reference](https://opentelemetry.io/docs/languages/js/instrumentation/)
- [OTLP/HTTP protocol](https://opentelemetry.io/docs/specs/otlp/#otlphttp)
- [Semantic conventions](https://opentelemetry.io/docs/specs/semconv/)
- [Auto-instrumentation packages list](https://github.com/open-telemetry/opentelemetry-js-contrib/tree/main/plugins/node)

## Related pages

- [Tempo](./tempo.md)
- [Grafana](./grafana.md)
- [Winston & Audit Logs](./winston.md)
