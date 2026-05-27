# Tools

This section explains **why dependencies exist** and where they fit in the app.

> OpenAPI-specific tools are documented in [API](../api/), not here.

## Tool map

```mermaid
flowchart TD
    A[Boilerplate tools] --> B[Runtime]
    A --> C[Security]
    A --> D[Database + Cache]
    A --> E[Observability]
    A --> F[Quality + Docs]
    A --> G[Outbound + Real-time]

    E --> E1[Winston]
    E --> E2[Prometheus]
    E --> E3[OpenTelemetry]
    E --> E4[Tempo]
    E --> E5[Grafana]
    E --> E6[PostHog]

    G --> G1[Email & PDF]
    G --> G2[WebSockets]
    G --> G3[RabbitMQ]
```

## Read by intent

| Need                                                             | Go to                                                                                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Understand framework-level dependencies                          | [Runtime](./runtime.md)                                                                                                                                            |
| Understand security middleware and auth helpers                  | [Security](./security.md)                                                                                                                                          |
| Understand persistence and cache tools                           | [MongoDB & Mongoose](./mongodb-mongoose.md) and [Redis Cache](./redis-cache.md)                                                                                    |
| Understand transactional email and PDF generation                | [Email & PDF Rendering](./email-and-rendering.md)                                                                                                                  |
| Understand message queue patterns                                | [RabbitMQ](./rabbitmq.md)                                                                                                                                          |
| Understand real-time messaging scaffolding                       | [WebSockets](./websockets.md)                                                                                                                                      |
| Understand logs, metrics, traces, dashboards, and analytics      | [Winston](./winston.md), [Prometheus](./prometheus.md), [OpenTelemetry](./opentelemetry.md), [Tempo](./tempo.md), [Grafana](./grafana.md), [PostHog](./posthog.md) |
| Understand tests and docs tooling                                | [Testing & Docs](./testing-and-docs.md)                                                                                                                            |
| Understand OpenAPI Generator, Spectral, Prism, Bruno, or Mockoon | [API](../api/)                                                                                                                                                     |

## Why this section is bigger now

This boilerplate does not only give you Express + Mongo.
It also gives you **opinionated example tooling** around security, observability, and maintenance.
That is why major tools now have their own pages.
