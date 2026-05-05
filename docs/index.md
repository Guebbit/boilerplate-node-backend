---
layout: home
hero:
    name: Boilerplate Node Backend
    text: api-mongodb-mongoose
    tagline: Single-package REST API boilerplate in the Node backend family.
    actions:
        - theme: brand
          text: Read Theory
          link: /theory/
        - theme: alt
          text: Explore Tools
          link: /tools/
        - theme: alt
          text: Follow the API flow
          link: /api/
features:
    - title: This repo's specific shape
      details: Express 5 + MongoDB + Mongoose + OpenAPI-first REST API, shipped as one package instead of a monorepo.
    - title: Layers stay visible
      details: Routes, middlewares, controllers, services, repositories, and models each keep a small, clear job.
    - title: Tooling is part of the boilerplate
      details: Security, Redis cache hooks, Prometheus, OpenTelemetry, Grafana dashboards, logging, and PostHog are all examples already wired in.
    - title: Contract-first workflow
      details: openapi.yaml stays the source of truth for API shape, generated types, mocks, and implementation alignment.
---

## What this docs site is for

This docs site stays short, visual, and practical.
Use it to understand **what this boilerplate is**, **how the app layers fit together**, and **which tools already exist in the repo**.

> Think of the repo as **an example backend blueprint**, not a finished product with product-specific business rules.

## Family map

```mermaid
flowchart TD
    A[Node backend boilerplate family] --> B[api-mongodb-mongoose\nthis repo]
    A --> C[mvc-mongodb-mongoose\nsame data stack, monorepo shape]
    A --> D[api-mongodb-mongoose-fastify-nestjs\nsame REST idea, different framework stack]
    A --> E[api-mysql-sequelize\nsame API-first idea, SQL stack]
    A --> F[mvc-mysql-sequelize\nMVC or monorepo + SQL stack]

    B --> T[Theory]
    B --> U[Tools]
    B --> V[API]
```

## Read this repo as

- **API**: REST API.
- **Framework**: [Express](./tools/runtime.md).
- **Database**: [MongoDB + Mongoose](./tools/mongodb-mongoose.md).
- **Observability**: [Prometheus](./tools/prometheus.md), [OpenTelemetry](./tools/opentelemetry.md), and [Grafana](./tools/grafana.md).
- **Contract**: [`openapi.yaml`](./api/openapi-workflow.md#openapi-is-the-source-of-truth).
- **Shape**: layered code explained in [Theory](./theory/) and the dedicated [Layers](./theory/layers.md) page.

## Three sections, three jobs

### [Theory](./theory/)

Big picture: architecture, layers, and request flow.

### [Tools](./tools/)

Dependency-focused pages: runtime, security, database, cache, logs, metrics, traces, Grafana, analytics, testing, and docs.

### [API](./api/)

Contract-first workflow: OpenAPI, REST style, codegen, mocks, and implementation alignment.

## Quick visual of the current repo

```mermaid
flowchart LR
    Spec[openapi.yaml] --> Routes[Routes + middlewares]
    Routes --> Controllers[Controllers]
    Controllers --> Services[Services]
    Services --> Repositories[Repositories]
    Repositories --> Models[Models]
    Models --> Mongo[(MongoDB)]

    Routes --> Obs[Logs + metrics + traces]
    Controllers --> Cache[Redis cache hooks]
    Obs --> Grafana[Grafana dashboards]
    Spec --> Types[Generated API types]
```

## Good starting points

- Want the app shape? Start at [Theory Overview](./theory/) and [Layers](./theory/layers.md).
- Want a specific dependency? Start at [Tools](./tools/) and jump to the tool page you need.
- Want observability? Read [Prometheus](./tools/prometheus.md), [OpenTelemetry](./tools/opentelemetry.md), and [Grafana](./tools/grafana.md).
- Want to change payloads or routes? Start in [API Overview](./api/) and keep [`openapi.yaml`](./api/openapi-workflow.md#openapi-is-the-source-of-truth) first.
