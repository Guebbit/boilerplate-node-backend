---
source: docker/observability/otel-collector.config.yaml
sha256: 8417770041ad23d91647de1f838b7eac45c04ee67701283c1e4eebff98cb0180
generated_at: 2026-10-29T01:18:45.254972+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/otel-collector.config.yaml

## Purpose

Configures the OpenTelemetry Collector as the telemetry gateway between the application and backend stores. It defines two pipelines: a trace pipeline that forwards app spans to Tempo, and a metrics pipeline that exposes derived service-graph metrics (request rate, error rate, latency between services) for Prometheus scraping.

## Key elements

- **`receivers.otlp`** — Ingests spans over HTTP (`:4318`) and gRPC (`:4317`) from the application.
- **`processors.batch`** — Batches spans before export to reduce round-trips and improve throughput.
- **`connectors.service_graph`** — Pairs client and server spans to derive the `traces_service_graph_request_*` metric family. Output feeds the metrics pipeline. Configures latency histogram buckets and a 10 s pairing TTL with a 10 000-item store.
- **`exporters.otlp_grpc/tempo`** — Forwards traces to the Tempo container on the Docker network (`tempo:4317`, TLS disabled).
- **`exporters.prometheus`** — Exposes the service-graph metrics on `:8889` for Prometheus to scrape (pull model).
- **`service.telemetry.metrics.readers`** — Serves the collector's own internal metrics (queue depth, dropped spans, exporter errors) on `0.0.0.0:8888` as a Prometheus pull endpoint.
- **`service.pipelines.traces`** — Wires `otlp` → `batch` → `otlp_grpc/tempo` + `service_graph`.
- **`service.pipelines.metrics/servicegraph`** — Wires `service_graph` → `prometheus`.

## Relationships

- **`docker/observability/prometheus.config.yaml`** — Scrapes two targets defined here: the service-graph metrics exporter (`otel-collector-spanmetrics` job, port 8889) and the collector's internal telemetry (`otel-collector` job, port 8888).
- **`docker/observability/tempo.config.yaml`** — Receives traces on its OTLP gRPC endpoint (`:4317`) from the `otlp_grpc/tempo` exporter configured here.
- **`docker/observability/grafana.datasources.yaml`** — Its Tempo datasource `serviceMap` setting queries the `traces_service_graph_request_*` series that only this file's `service_graph` connector produces. Without this collector config that tab renders empty.

## Notes

- The internal-telemetry endpoint **must** bind to `0.0.0.0:8888`. Since collector v0.104 the default is `localhost:8888`, which inside a container is unreachable from the separate Prometheus container, silently dropping all internal metrics.
- The `readers` syntax for telemetry metrics replaced the older `address:` shorthand (removed in collector 0.162).
- The `prometheus` exporter port (8889) is deliberately distinct from the internal-telemetry port (8888) so that "collector health" and "derived application metrics" remain separate Prometheus targets.
- `tls.insecure: true` on the Tempo exporter and `0.0.0.0` bindings are intentional for this local Docker stack; no ports are published outside the host.
