---
layout: home
hero:
    name: Node API Boilerplate
    text: Express · MongoDB · Mongoose
    tagline: A production-ready REST API starter with a clean layered architecture.
    actions:
        - theme: brand
          text: Get Started
          link: /guide/getting-started
        - theme: alt
          text: Endpoint Lifecycle
          link: /guide/endpoint-lifecycle
features:
    - title: Layered Architecture
      details: Controller → Service → Repository separation keeps each concern isolated and testable.
    - title: OpenAPI-first
      details: The API contract lives in openapi.yaml and drives code generation, mocking, and validation.
    - title: Auth out of the box
      details: JWT access tokens + refresh tokens with per-session revocation already wired up.
    - title: Ready for production
      details: Clustering, rate limiting, soft deletes, migrations, seeds, structured logging — all included.
    - title: Structured Logging (Phase 1)
      details: Production-grade JSON logs with timestamps, request IDs, duration, user ID, and automatic sensitive-field redaction.
      link: /guide/structured-logging
    - title: Audit Logging (Phase 1)
      details: Dedicated audit logger for security and admin events, separate from the main app log stream and ready for SIEM routing.
      link: /guide/audit-logging
    - title: Prometheus Metrics (Phase 2)
      details: HTTP counters, latency histograms, in-flight gauge, business counters (login/signup/checkout/orders), and DB query metrics — all via prom-client.
      link: /guide/prometheus-metrics
    - title: OpenTelemetry Tracing (Phase 3)
      details: Distributed traces for every HTTP request, Mongoose query, and email send. Trace IDs in every log line. Export to Grafana Tempo or Jaeger via OTLP.
      link: /guide/opentelemetry-tracing
    - title: Loki Centralized Logging (Phase 4)
      details: Optional Winston transport ships every structured log line to Grafana Loki. Stream labels, trace/log correlation, and zero-breaking-change activation via NODE_LOKI_HOST.
      link: /guide/loki-logging
    - title: Tempo & Grafana Dashboards (Phase 5)
      details: Grafana Tempo as the OTLP trace backend, pre-built dashboard JSON files (API overview, logs, traces), and step-by-step log/trace correlation guide.
      link: /guide/grafana-dashboards
---
