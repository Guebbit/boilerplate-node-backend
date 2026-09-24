---
source: docker/observability/otel-collector.config.yaml
sha256: e5fc79f1273ed44c1e8b550f8849e1a201133436b9ed4046a492b2c0910d005f
generated_at: 2026-09-23T17:13:30.118848+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/otel-collector.config.yaml

## Purpose

Pipeline configuration for the OpenTelemetry Collector container: it receives application traces over OTLP, batches them, forwards them to Tempo, and derives inter-service request metrics from those traces for Prometheus to scrape. It exists so the app only needs to speak OTLP to one endpoint while the backend topology (trace storage, metric derivation) is handled outside the application.

## Key elements

- **`receivers.otlp`** – OTLP ingest on `0.0.0.0:4318` (HTTP) and `0.0.0.0:4317` (gRPC). The app's trace SDK points here.
- **`processors.batch`** – Coalesces spans before export to reduce per-span I/O.
- **`connectors.servicegraph`** – Pairs client spans with their matching server spans and emits `traces_service_graph_request_*` metrics (rate, error rate, latency histograms). Configured with a 10 s unpaired-span TTL and 10 000-item store.
- **`exporters.otlp/tempo`** – Forwards spans to the Tempo container at `tempo:4317` over the Docker network (TLS disabled).
- **`exporters.prometheus`** – Exposes the connector's derived metrics on `0.0.0.0:8889` for Prometheus pull.
- **`service.telemetry.metrics.address`** – Collector's own health/queue/failure metrics on `0.0.0.0:8888`, scraped as a separate Prometheus job.
- **`service.pipelines.traces`** – OTLP → batch → {otlp/tempo, servicegraph}.
- **`service.pipelines.metrics/servicegraph`** – servicegraph connector → prometheus exporter.

## Relationships

- **`tempo.config.yaml`** – Receives spans from the `otlp/tempo` exporter (gRPC on `tempo:4317`). Tempo is the trace store the app's spans land in.
- **`prometheus.config.yaml`** – Defines two scrape targets against this collector: the derived service-graph metrics on port **8889** (job `otel-collector-spanmetrics`) and the collector's internal telemetry on port **8888** (job `otel-collector`).
- **`grafana.datasources.yaml`** – Its Tempo datasource's `serviceMap` setting queries the `traces_service_graph_request_*` series produced by the `servicegraph` connector. Without this collector the tab renders empty.

## Notes

- The `servicegraph` connector is the _only_ producer of the service-graph metric series. If it is removed or its pipeline is misnamed, Grafana's Service Graph tab silently shows nothing—no scrape error, no exporter failure.
- `service.telemetry.metrics.address` must remain `0.0.0.0:8888`. Since collector v0.104 the default is `localhost:8888`, which inside a container is unreachable from the Prometheus container; the target would go DOWN with no other symptom.
- Ports 8888 (internal telemetry) and 8889 (derived metrics) are intentionally separate Prometheus jobs so collector health and derived data are not conflated in a single target.
- All listeners bind `0.0.0.0`; this is safe only because nothing in the compose stack is published to the host beyond the app's own ports.
