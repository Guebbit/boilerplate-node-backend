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
      details: openapi.yaml covers REST contracts and asyncapi.yaml covers realtime/event contracts.
---

## What this docs site is for

This docs site stays short, visual, and practical.
Use it to understand **what this boilerplate is**, **how the app layers fit together**, and **which tools already exist in the repo**.

> Think of the repo as **an example backend blueprint**, not a finished product with product-specific business rules.

## Family map

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 55, 'rankSpacing': 70}}}%%
flowchart TD
    A[Node backend boilerplate family] --> B[api-mongodb-mongoose\nthis repo]
    A --> C[mvc-mongodb-mongoose\nsame data stack, monorepo shape]
    A --> D[api-mongodb-mongoose-fastify-nestjs\nsame REST idea, different framework stack]
    A --> E[api-mysql-sequelize\nsame API-first idea, SQL stack]
    A --> F[mvc-mysql-sequelize\nMVC or monorepo + SQL stack]

    B --> T[Theory]
    B --> U[Tools]
    B --> V[API]

    classDef family fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef current fill:#ddd6fe,stroke:#7c3aed,color:#111827;
    classDef docs fill:#dbeafe,stroke:#2563eb,color:#111827;
    class A,C,D,E,F family;
    class B current;
    class T,U,V docs;
```

## Read this repo as

- **API**: REST API.
- **Framework**: [Express](./tools/runtime.md).
- **Database**: [MongoDB + Mongoose](./tools/mongodb-mongoose.md).
- **Observability**: [Observability Reference](./tools/observability-reference.md), [Prometheus](./tools/prometheus.md), [OpenTelemetry](./tools/opentelemetry.md), and [Grafana](./tools/grafana.md).
- **Real-time / outbound**: [WebSockets](./tools/websockets.md) and [email + PDF rendering](./tools/email-and-rendering.md).
- **Process model**: [Clustering & graceful shutdown](./theory/clustering.md).
- **Contracts**: [`openapi.yaml`](./api/openapi-workflow.md#openapi-is-the-source-of-truth) + [`asyncapi.yaml`](./api/asyncapi-workflow.md#asyncapi-is-the-async-contract-source-of-truth).
- **Shape**: layered code explained in [Theory](./theory/) and the dedicated [Layers](./theory/layers.md) page.

## Three sections, three jobs

### [Theory](./theory/)

Big picture: architecture, layers, and request flow.

### [Tools](./tools/)

Dependency-focused pages: runtime, security, database, cache, logs, metrics, traces, package groups, scripts, containers, analytics, testing, and docs.
New to the stack? Start at [Tools Explained](./tools/tools-explained.md) for a plain-English "what is X and why is it here" summary of every tool.

### [API](./api/)

Contract-first workflow: OpenAPI + AsyncAPI, codegen, mocks, and implementation alignment.

## Quick visual of the current repo

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 55, 'rankSpacing': 70}}}%%
flowchart LR
    OpenSpec[openapi.yaml] --> Routes[Routes + middlewares]
    AsyncSpec[asyncapi.yaml] --> Realtime[WebSocket + SSE contracts]
    Routes --> Controllers[Controllers]
    Controllers --> Services[Services]
    Services --> Repositories[Repositories]
    Repositories --> Models[Models]
    Models --> Mongo[(MongoDB)]
    Services --> Queue[(RabbitMQ\nasync jobs)]

    Routes --> Obs[Traces · metrics · logs]
    Controllers --> Cache[(Redis\ncache hooks)]
    Obs --> Grafana[Grafana dashboards]
    OpenSpec --> Types[Generated API types]

    classDef contract fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef app fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef data fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef cache fill:#ffedd5,stroke:#ea580c,color:#111827;
    classDef queue fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef ops fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef ui fill:#fce7f3,stroke:#db2777,color:#111827;
    class OpenSpec,AsyncSpec,Types contract;
    class Routes,Realtime,Controllers,Services app;
    class Repositories,Models,Mongo data;
    class Cache cache;
    class Queue queue;
    class Obs ops;
    class Grafana ui;
```

## Good starting points

- Want the app shape? Start at [Theory Overview](./theory/) and [Layers](./theory/layers.md).
- Want a specific dependency? Start at [Tools](./tools/) and jump to the tool page you need.
- Want the `package.json` map? Read [Package Dependencies](./tools/package-dependencies.md) and [Package Scripts](./tools/package-scripts.md).
- Want observability? Start with [Observability Reference](./tools/observability-reference.md), then jump to [Prometheus](./tools/prometheus.md), [OpenTelemetry](./tools/opentelemetry.md), and [Grafana](./tools/grafana.md).
- Want to change payloads or routes? Start in [API Overview](./api/) and keep [`openapi.yaml`](./api/openapi-workflow.md#openapi-is-the-source-of-truth) first.
