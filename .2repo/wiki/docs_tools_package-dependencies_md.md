# docs/tools/package-dependencies.md

## Purpose

A quick-reference map of every dependency in `package.json`, grouped into purpose-based families (runtime core, security, persistence, messaging, observability, etc.) with a one-line "why" for each group and a link to the deeper doc page. It exists so a reader can orient themselves in the dependency surface without opening `package.json` or reading each individual tool doc.

## Key elements

- **Runtime dependencies table** – nine family rows (core, security, Mongo, Redis, RabbitMQ, email/rendering, metrics, logging, analytics, OpenTelemetry) each listing the exact package names, a short rationale, and a "Read more" link.
- **Dev dependencies table** – eight family rows (TypeScript toolchain, `@types`, test, ESLint, Prettier, OpenAPI tooling, VitePress docs, `migrate-mongo`) with the same structure.
- **Quick take** – three bullet points summarising the split between core and optional infra, and explaining why the dev-dep list is unusually large.

## Relationships

- **`docs/tools/opentelemetry.md`** – Linked directly from the OpenTelemetry family row ("Read more"). The dependency page names the exact `@opentelemetry/*` packages; the OTel doc explains how they are wired together.
- **`docs/tools/observability-layer.md`** – The Metrics (`prom-client`), Logging (`winston`), and OpenTelemetry rows collectively describe the packages that the observability-layer doc assembles into a coherent stack. This page is the "which packages" reference; the observability-layer doc is the "how they fit together" reference.

## Notes

- The "Quick take" flags that most observability and queue packages (RabbitMQ, Redis, OTel, PostHog, Prometheus) are **optional at runtime** — the basic API still works without them.
- Dev dependencies are intentionally heavy because the repo also ships OpenAPI contract tooling (Prism/Spectral/codegen), a VitePress docs site with Mermaid diagrams, and `migrate-mongo` migrations — not just application code.
- Grouping is by *purpose*, not by npm scope; same-namespace packages (e.g., all `@opentelemetry/*`) are kept together in one row for easier scanning.
