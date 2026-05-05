# OpenTelemetry

## Why OpenTelemetry is here

OpenTelemetry gives the boilerplate **trace context** and distributed-tracing support.
It helps answer: _which request path was slow, and where did the time go?_

## Trace flow

```mermaid
flowchart LR
    Client --> HTTP[HTTP request]
    HTTP --> OTel[OpenTelemetry SDK]
    OTel --> Express[Express route flow]
    Express --> DB[Mongoose query spans]
    OTel --> Export[OTLP exporter]
    Export --> Tempo[Tempo / tracing backend]
    Tempo --> Grafana[Grafana trace views]
```

## Why it matters in this repo

- tracing starts early in app boot,
- HTTP and Express are instrumented,
- database spans and correlation helpers already exist,
- it works nicely with logs and metrics together.

## Related pages

- [Prometheus](./prometheus.md)
- [Grafana](./grafana.md)
- [Winston & Audit Logs](./winston.md)
