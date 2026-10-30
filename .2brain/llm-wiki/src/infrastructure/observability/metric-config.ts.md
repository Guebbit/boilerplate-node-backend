---
source: src/infrastructure/observability/metric-config.ts
sha256: 99c9a3534e7d21041ed331f66730bb672e2b0f3b3555238fa6a056b9fa21c58a
generated_at: 2026-10-29T02:09:45.434100+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/metric-config.ts

## Purpose

Translates static metric definitions (generated from `shared/rules/metrics.yaml` into `metrics.generated.ts`) into the constructor-option objects that prom-client's `Counter`, `Gauge`, and `Histogram` classes expect. It is a pure mapping layer: it never touches a registry, so call sites remain free to decide *where* and *when* to register.

## Key elements

- **`MetricData<TLabel>`** (internal) — the minimal shape every metric entry must provide: `name`, `help`, and optional `labelNames`.
- **`base`** (internal) — builds the shared `{ name, help, labelNames? }` fragment used by all three public helpers.
- **`counterConfig(data)`** — returns a `CounterConfiguration<TLabel>` ready to spread into `new Counter({ … })`.
- **`gaugeConfig(data)`** — returns a `GaugeConfiguration<TLabel>` ready to spread into `new Gauge({ … })`.
- **`histogramConfig(data)`** — like the above for histograms, but additionally copies `buckets` into a new mutable `number[]` (prom-client requires a mutable array; the source is `readonly`).

## Relationships

- **Consumed by metric producers** (`metrics-cache`, `metrics-http`, `metrics-outbox`, `metrics-process`, `metrics-queue`, `metrics-rate-limit`, `security-events`, `command-metrics`): each calls one of the three exported helpers to obtain constructor options, then instantiates the corresponding prom-client class and registers it.
- **`metrics-registry.ts`** – the registry into which the instantiated metrics are registered at those call sites; this file never imports or references it directly.
- **`metric-config.test.ts`** – unit tests exercising the three helpers (type-level label inference, readonly→mutable bucket copy, presence/absence of `labelNames`).

## Notes

- The `as const` arrays in the generated data are `readonly`, but prom-client's `buckets` field is typed as mutable `number[]`. Only `histogramConfig` performs the defensive copy (`[...data.buckets]`); counters and gauges have no such field.
- All three helpers default the type parameter to `never`, so a metric without labels simply omits the generic argument at the call site.
- Registration and collection wiring (`register`, `collect`) deliberately live in the consumer files, keeping this module side-effect-free and trivially testable.
