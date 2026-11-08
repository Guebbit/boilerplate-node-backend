---
source: docker/observability/otel-collector.config.yaml
sha256: 8417770041ad23d91647de1f838b7eac45c04ee67701283c1e4eebff98cb0180
generated_at: 2026-11-08T02:22:25.617519+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/otel-collector.config.yaml

## Purpose

OpenTelemetry Collector configuration that acts as the telemetry gateway for the local Docker stack. It receives OTLP traces from the application, forwards them to Tempo, and derives inter-service metrics (the `traces_service_graph_request_*` family) from those traces so Grafana's Service Graph tab has data to render.

## Key elements

- **`receivers.otlp`** — OTLP ingest over HTTP (`0.0.0.0:4318`) and gRPC (`0.0.0.0:4317`). The app's primary path is HTTP.
- **`processors.batch`** — Coalesces spans before export to reduce per-span network chatter.
- **`connectors.service_graph`** — Pairs client→server spans and emits derived metrics (request rate, error rate, latency histograms with buckets `0.01s–10s`). Spans are consumed and discarded; only the computed metrics leave this connector. `store.ttl: 10s` and `max_items: 10000` govern the unpaired-span buffer.
- **`exporters.otlp_grpc/tempo`** — Forwards traces to the `tempo` container on `4317` (insecure, internal network).
- **`exporters.prometheus`** — Serves the connector's derived metrics on `0.0.0.0:8889` for Prometheus scraping.
- **`service.telemetry.metrics.readers`** — Pull-based internal telemetry (collector health, queue depth, dropped spans) exposed on `0.0.0.0:8888` via the `pull` reader syntax introduced after v0.162.
- **`service.pipelines.traces`** — `otlp → batch → [otlp_grpc/tempo, service_graph]`.
- **`service.pipelines.metrics/servicegraph`** — `service_graph → prometheus`.

## Relationships

- **`docker/observability/prometheus.config.yaml`** — Defines two scrape jobs that consume this file's endpoints: `otel-collector` (port 8888, internal telemetry) and `otel-collector-spanmetrics` (port 8889, derived service-graph metrics). Without this file exposing those ports, both jobs would be DOWN.
- **`docker/observability/grafana.datasources.yaml`** — The Tempo datasource's `serviceMap` block queries Prometheus for the `traces_service_graph_request_*` series. This collector is the sole producer of those series; if the `service_graph` connector is missing, the Grafana Service Graph tab renders empty with no error.

## Notes

- The `0.0.0.0` bind on all three listening endpoints (4317, 4318, 8888, 8889) triggers "exposes to every interface" warnings from the collector. This is intentional: nothing in this compose stack is port-published outside the host, and `0.0.0.0` is required so cross-container traffic works.
- Port 8889 (derived metrics) is deliberately separated from 8888 (collector self-telemetry). Merging them would make "collector health" and "business metrics derived by collector" a single Prometheus target, complicating alerting and dashboards.
- The `telemetry.metrics.readers` block is **required**, not optional. Since collector v0.104 the default listener is `localhost:8888`, which inside a container resolves to the collector's own loopback — Prometheus (a different container) gets `connection refused` and the target sits DOWN silently. Omitting the block means the collector works but is unobservable.
- The `service_graph` connector is the *only* source of the service-map metrics. There is no second SDK in the app producing them; if you remove the connector or its pipeline, the Grafana Service Graph tab goes blank with no configuration error anywhere.
