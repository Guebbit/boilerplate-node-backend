# Request Flow

## End-to-end path

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 60, 'rankSpacing': 90}}}%%
flowchart LR
    Client(["Client"])

    subgraph MW ["Middleware chain"]
        direction TB
        Helmet["Helmet\n+ CORS"]
        Rate["Rate\nlimiter"]
        Auth["JWT auth\nmiddleware"]
        Helmet --> Rate --> Auth
    end

    subgraph Core ["Business core"]
        direction TB
        Ctrl["Controller\nparse input · format response"]
        Svc["Service\nbusiness rules · validation"]
        Ctrl --> Svc
    end

    subgraph Persist ["Persistence"]
        direction TB
        Repo["Repository\nquery builder"]
        Model["Mongoose model\nschema mapping"]
        Mongo[("MongoDB")]
        Repo --> Model --> Mongo
    end

    Cache[("Redis cache\nGET: read · write: invalidate")]
    Queue[("RabbitMQ\nemail · PDF jobs")]
    Resp(["Response"])

    Client --> Helmet
    Auth   --> Ctrl
    Svc    --> Repo
    Ctrl  <--> Cache
    Svc    --> Queue
    Ctrl   --> Resp

    classDef client fill:#f0fdf4,stroke:#16a34a,color:#111827;
    classDef mw     fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef core   fill:#ddd6fe,stroke:#7c3aed,color:#111827;
    classDef data   fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef cache  fill:#ffedd5,stroke:#ea580c,color:#111827;
    classDef queue  fill:#dcfce7,stroke:#16a34a,color:#111827;

    class Client,Resp client;
    class Helmet,Rate,Auth mw;
    class Ctrl,Svc core;
    class Repo,Model,Mongo data;
    class Cache cache;
    class Queue queue;
```

## Observability signals

Every request produces three independent signal streams in parallel with the flow above.

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 55, 'rankSpacing': 80}}}%%
flowchart LR
    Req(["Every\nrequest"])

    subgraph Traces["Traces"]
        direction LR
        OTel["OTel SDK\nauto-spans"]
        Coll["OTel Collector"]
        Tempo["Tempo"]
        OTel --> Coll --> Tempo
    end

    subgraph Logs["Logs"]
        direction LR
        Win["Winston\nJSON to stdout"]
        Tail["Promtail"]
        Loki["Loki"]
        Win --> Tail --> Loki
    end

    subgraph Metrics["Metrics"]
        direction LR
        Prom["Prometheus\nscrapes /metrics"]
    end

    Grafana["Grafana\ndashboard"]

    Req -.->|"span per\nHTTP · DB · Redis call"| OTel
    Req -.->|"one line per\nrequest + trace_id"| Win
    Req -.->|"http_requests_total\nlatency histogram"| Prom

    Tempo --> Grafana
    Loki  --> Grafana
    Prom  --> Grafana

    classDef req   fill:#f0fdf4,stroke:#16a34a,color:#111827;
    classDef trace fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef log   fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef met   fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef ui    fill:#fce7f3,stroke:#db2777,color:#111827;

    class Req req;
    class OTel,Coll,Tempo trace;
    class Win,Tail,Loki log;
    class Prom met;
    class Grafana ui;
```

## What each layer does

| Layer                                 | Responsibility                                                                                                                                                                                       |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Middleware chain                      | Helmet sets security headers · CORS checks the origin · rate limiter blocks abuse · JWT auth verifies the token (or skips for public routes)                                                         |
| Redis cache                           | GET requests probe Redis first. A hit returns the stored response immediately — no controller, no database reached. On a write the controller invalidates related tags so stale entries are evicted. |
| Controller                            | Parses HTTP input, calls the service, formats the final response envelope.                                                                                                                           |
| Service                               | Applies business rules and validation (Zod). Publishes async jobs to RabbitMQ when needed.                                                                                                           |
| Repository → Mongoose model → MongoDB | Runs the actual database query. Repositories own query shape; models own schema. Controllers never touch either directly.                                                                            |
| RabbitMQ                              | Receives heavy async jobs (email, PDF). The HTTP handler responds immediately; a separate worker processes the job at its own pace.                                                                  |

## Cross-cutting strategies

### Security first

Things like [Helmet](../tools/security.md), CORS, cookies, auth, and rate limits happen near the edge.
That keeps the inside layers focused.

### Validation close to intent

Input coercion and business validation happen in services, often with [Zod](../tools/runtime.md), instead of being mixed into repositories.

### Optional acceleration

[Redis cache hooks](../tools/redis-cache.md) speed up repeated reads, but the API still works when Redis is off.

### Async offloading

Heavy tasks (email, PDF generation) are pushed to [RabbitMQ](../tools/rabbitmq.md) so the HTTP response returns immediately.

### Signals everywhere

[Winston](../tools/winston.md), [Prometheus](../tools/prometheus.md), [OpenTelemetry](../tools/opentelemetry.md), and [Grafana](../tools/grafana.md) make it easier to debug the same request from multiple angles. Each log line carries a `trace_id` that links back to the full trace in Grafana → Tempo.

## Why the flow matters

When you change behavior, ask:

- Is this an **API contract** change? Go to [API](../api/).
- Is this a **dependency or infrastructure** concern? Go to [Tools](../tools/).
- Is this a **layer ownership** issue? Go back to [Layers](./layers.md).
- Is this about **process lifecycle**, scaling, or shutdown? Go to [Clustering & Shutdown](./clustering.md).
