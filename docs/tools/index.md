# Tools

This section explains **why dependencies exist** and where they fit in the app.

> OpenAPI-specific tools are documented in [API](../api/), not here.

## Tool map

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 70, 'rankSpacing': 95}}}%%
flowchart LR
    A[Boilerplate tools]

    subgraph Core[Core stack]
        Runtime[Runtime]
        Security[Security]
        Mongo[MongoDB & Mongoose]
        Redis[Redis Cache]
    end

    subgraph Async[Async + outbound]
        Rabbit[RabbitMQ]
        Mail[Email & PDF]
        Ws[WebSockets]
    end

    subgraph Observability[Observability]
        Winston[Winston]
        Prometheus[Prometheus]
        OTel[OpenTelemetry]
        Tempo[Tempo]
        Grafana[Grafana]
        Loki[Loki]
        PostHog[PostHog]
    end

    subgraph Project[Project workflows]
        Testing[Testing & Docs]
        Dependencies[Package dependencies]
        Scripts[Package scripts]
        Containers[Docker & Podman]
    end

    A --> Runtime
    A --> Security
    A --> Mongo
    A --> Redis
    A --> Rabbit
    A --> Mail
    A --> Ws
    A --> Winston
    A --> Prometheus
    A --> OTel
    A --> Tempo
    A --> Grafana
    A --> Loki
    A --> PostHog
    A --> Testing
    A --> Dependencies
    A --> Scripts
    A --> Containers

    classDef root fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef async fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef observability fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef project fill:#fce7f3,stroke:#db2777,color:#111827;
    class A root;
    class Runtime,Security,Mongo,Redis core;
    class Rabbit,Mail,Ws async;
    class Winston,Prometheus,OTel,Tempo,Grafana,Loki,PostHog observability;
    class Testing,Dependencies,Scripts,Containers project;
```

## Read by intent

| Need                                                             | Go to                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand framework-level dependencies                          | [Runtime](./runtime.md)                                                                                                                                                                                                                        |
| Understand security middleware and auth helpers                  | [Security](./security.md)                                                                                                                                                                                                                      |
| Understand persistence and cache tools                           | [MongoDB & Mongoose](./mongodb-mongoose.md) and [Redis Cache](./redis-cache.md)                                                                                                                                                                |
| Understand transactional email and PDF generation                | [Email & PDF Rendering](./email-and-rendering.md)                                                                                                                                                                                              |
| Understand message queue patterns                                | [RabbitMQ](./rabbitmq.md)                                                                                                                                                                                                                      |
| Understand real-time messaging scaffolding                       | [WebSockets](./websockets.md)                                                                                                                                                                                                                  |
| Understand logs, metrics, traces, dashboards, and analytics      | [Observability Reference](./observability-reference.md), [Winston](./winston.md), [Prometheus](./prometheus.md), [OpenTelemetry](./opentelemetry.md), [Tempo](./tempo.md), [Grafana](./grafana.md), [Loki](./loki.md), [PostHog](./posthog.md) |
| Understand tests and docs tooling                                | [Testing & Docs](./testing-and-docs.md)                                                                                                                                                                                                        |
| Understand `package.json` dependency groups                      | [Package Dependencies](./package-dependencies.md)                                                                                                                                                                                              |
| Understand `package.json` scripts                                | [Package Scripts](./package-scripts.md)                                                                                                                                                                                                        |
| Understand local container setup                                 | [Docker & Podman](./docker-and-podman.md)                                                                                                                                                                                                      |
| Understand OpenAPI Generator, Spectral, Prism, Bruno, or Mockoon | [API](../api/)                                                                                                                                                                                                                                 |

## Why this section is bigger now

This boilerplate does not only give you Express + Mongo.
It also gives you **opinionated example tooling** around security, observability, and maintenance.
That is why major tools now have their own pages.
