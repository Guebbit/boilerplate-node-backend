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
    - title: Boilerplate family mindset
      details: Same purpose can exist with other stacks such as mvc-mongodb-mongoose or api-mysql-sequelize. This repo is the Mongo + Mongoose REST variant.
    - title: Production-minded defaults
      details: Auth, security headers, rate limiting, Redis cache hooks, observability, logging, and clustering are already wired.
    - title: Contract-first workflow
      details: openapi.yaml stays the source of truth for API shape, generated types, mocks, and implementation alignment.
---

## What this docs site is for

This docs site stays intentionally short.
Use it to understand **what this boilerplate is**, **why the code is shaped this way**, and **where to change things safely**.

> Think of the repo as **an example backend blueprint**, not a finished product with product-specific business rules.

## Family map

```mermaid
flowchart TD
    A[Node backend boilerplate family] --> B[api-mongodb-mongoose\nthis repo]
    A --> C[mvc-mongodb-mongoose\nsame data stack, monorepo shape]
    A --> D[api-mongodb-mongoose-fastify-nestjs\nsame REST idea, different framework stack]
    A --> E[api-mysql-sequelize\nsame API-first idea, SQL stack]
    A --> F[mvc-mysql-sequelize\nMVC or monorepo + SQL stack]

    B --> T[Theory section]
    B --> U[Tools section]
    B --> V[API section]
```

### Read this repo as:

- **API**: REST API.
- **Transport/framework**: [Express](./tools/runtime-and-security.md#core-runtime).
- **Database**: [MongoDB](./tools/runtime-and-security.md#core-runtime) with [Mongoose](./tools/runtime-and-security.md#core-runtime).
- **Contract**: [`openapi.yaml`](./api/openapi-workflow.md#openapi-is-the-source-of-truth).
- **Style**: layered code with a contract-first workflow from [Theory](./theory/) to [API](./api/).

## Three sections, three jobs

### [Theory](./theory/)

Use this when you want the big picture: architecture, request flow, and the strategies already present in the code.

### [Tools](./tools/)

Use this when you want to know why dependencies exist: security, runtime, observability, testing, docs, and quality tools.

### [API](./api/)

Use this when you want to change the REST contract, regenerate types, mock endpoints, or keep implementation aligned with the spec.

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
    Spec --> Types[Generated API types]
```

## Good starting points

- Want the architecture? Start at [Theory Overview](./theory/).
- Want to know why [Helmet](./tools/runtime-and-security.md#security-stack) or [Prometheus](./tools/observability-and-quality.md#observability-stack) is here? Go to [Tools](./tools/).
- Want to change payloads or routes? Start in [API Overview](./api/) and keep [`openapi.yaml`](./api/openapi-workflow.md#openapi-is-the-source-of-truth) first.
