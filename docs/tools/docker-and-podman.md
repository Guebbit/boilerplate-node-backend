# Docker & Podman

This repo ships one local container implementation built around `docker-compose.yml`.
It works as a Docker flow and also maps cleanly to the Podman helper scripts in `package.json`.

## Container map

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 55, 'rankSpacing': 75}}}%%
flowchart LR
    Host([Host machine])

    subgraph Compose["docker-compose.yml"]
        subgraph AppRuntime["App runtime"]
            App["app\nExpress API :3000"]
        end

        subgraph CoreData["Core data"]
            MongoDB[("database\nMongoDB :27017")]
            Redis[("redis\nRedis cache :6379")]
            RabbitMQ["rabbitmq\nAMQP :5672\nUI :15672"]
        end

        subgraph ObsStack["Observability stack"]
            OTelCol["otel-collector\nOTLP ingestion\n:4317 gRPC · :4318 HTTP"]
            Tempo["tempo\nTrace storage"]
            Prometheus["prometheus\nMetrics scraping :9090"]
            Alertmanager["alertmanager\nAlert routing :9093"]
            Promtail["promtail\nLog collection"]
            Loki["loki\nLog storage :3100"]
            Grafana["grafana\nUI dashboard :3001"]
        end
    end

    Host --> App
    App --> MongoDB
    App --> Redis
    App --> RabbitMQ
    App -->|"OTLP/HTTP traces"| OTelCol
    OTelCol --> Tempo
    Prometheus -->|"scrape /observability/metrics"| App
    Prometheus -->|"firing alerts"| Alertmanager
    Promtail --> Loki
    Tempo --> Grafana
    Prometheus --> Grafana
    Loki --> Grafana

    classDef host fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef app fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef data fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef obs fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef ui fill:#fce7f3,stroke:#db2777,color:#111827;

    class Host host;
    class App app;
    class MongoDB,Redis,RabbitMQ data;
    class OTelCol,Tempo,Prometheus,Alertmanager,Promtail,Loki obs;
    class Grafana ui;
```

## What is implemented

| Area                | Current implementation                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| App image           | `.docker/Dockerfile` based on `node:25-alpine`, with Chromium installed for Puppeteer-driven PDF rendering                                 |
| Local orchestration | `docker-compose.yml` defines app, MongoDB, Redis, RabbitMQ, and the full observability stack                                               |
| Dev workflow        | bind mount source code into `/app`, keep `node_modules` inside the container, switch between single-worker and clustered dev commands      |
| Podman support      | `compose:restart`, `compose:rebuild` and `compose:kill` drive either engine through `scripts/compose.ts`; pick one with `CONTAINER_ENGINE` |

## Container reference

### App runtime

| Container | Image                                            | Port(s)                      | Role                                                                                                                         |
| --------- | ------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `app`     | `.docker/Dockerfile` (node:25-alpine + Chromium) | `NODE_PORT` (default `3000`) | Runs the Express API. In dev: bind-mounted source, hot-reload. Depends on `database`, `redis`, `rabbitmq`, `otel-collector`. |

### Core data

| Container  | Image                   | Port(s)                                | Role                                                                                       |
| ---------- | ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| `database` | `mongo:8`               | `27017`                                | Primary datastore. Persists data in a named Docker volume (`boilerplate_mongodb_volume`).  |
| `redis`    | `redis:7`               | `6379`                                 | Server-side response cache. Cache is intentionally ephemeral — data is lost on restart.    |
| `rabbitmq` | `rabbitmq:3-management` | `5672` (AMQP), `15672` (management UI) | Message broker for async jobs (email, PDF generation). Management UI available in browser. |

### Observability stack

| Container        | Image                                          | Port(s)                      | Role                                                                                                            |
| ---------------- | ---------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `otel-collector` | `otel/opentelemetry-collector-contrib:0.114.0` | `4317` (gRPC), `4318` (HTTP) | Single ingestion point for all OTLP telemetry from the app. Fans out traces to Tempo.                           |
| `tempo`          | `grafana/tempo:2.6.1`                          | internal only                | Stores distributed traces received from the OTel Collector. Queried by Grafana.                                 |
| `prometheus`     | `prom/prometheus:v2.55.1`                      | `9090`                       | Scrapes `/observability/metrics` from the app every 15 s. Evaluates alert rules. 7-day retention.               |
| `alertmanager`   | `prom/alertmanager:v0.27.0`                    | `9093`                       | Receives firing alerts from Prometheus. Routes/groups notifications. Null receiver by default in local dev.     |
| `loki`           | `grafana/loki:3.3.2`                           | `3100`                       | Stores log lines shipped by Promtail. Queried by Grafana via LogQL. 7-day retention.                            |
| `promtail`       | `grafana/promtail:3.3.2`                       | internal only                | Tails container log files and pushes entries to Loki. Needs a runtime override for Docker vs Podman log paths.  |
| `grafana`        | `grafana/grafana:11.4.0`                       | `3001`                       | Unified UI: explore traces (Tempo), metrics (Prometheus), and logs (Loki). Anonymous admin access in local dev. |

## Service groups

| Group         | Services                                                                               | Why they are here                                     |
| ------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| App runtime   | `app`                                                                                  | runs the backend with container-friendly dev commands |
| Core data     | `database`, `redis`, `rabbitmq`                                                        | persistence, cache/pub-sub, and async jobs            |
| Observability | `otel-collector`, `tempo`, `prometheus`, `alertmanager`, `loki`, `promtail`, `grafana` | traces, metrics, logs, and dashboards                 |

## How to think about the setup

- **Compose is the local truth**: one file wires together the app plus all sidecars needed for demos and local debugging.
- **The Dockerfile is intentionally simple**: install dependencies once, add Chromium for PDF support, then let compose decide runtime commands.
- **Podman is treated as a compatible local engine**, not a separate architecture.

## Podman and Promtail log collection

Docker writes container logs as `json-file` under `/var/lib/docker/containers`. Rootless Podman
uses the `k8s-file` log driver (CRI format) and stores them under a different host path. Promtail
has to be pointed at the right one, or it tails nothing.

The base `docker-compose.yml` therefore mounts **neither**. Each runtime adds its own path through
a small override file — `docker-compose.docker.yml` or `docker-compose.podman.yml` — and
`scripts/compose.ts` passes the correct one with `-f`:

```bash
npm run compose:restart                          # engine auto-detected
CONTAINER_ENGINE=podman npm run compose:restart  # -f docker-compose.yml -f docker-compose.podman.yml
CONTAINER_ENGINE=docker npm run compose:restart  # -f docker-compose.yml -f docker-compose.docker.yml
```

### Choosing the engine

`scripts/compose.ts` resolves it in this order, and prints the result on every run:

1. `CONTAINER_ENGINE` in the environment,
2. `CONTAINER_ENGINE` in `.env`,
3. whichever of the two is actually installed,
4. `docker`.

**Set it in `.env` if you have both installed and want podman** — step 3 cannot tell a preference
from a coincidence, so it prefers docker when both answer `--version`.

This replaced eight npm scripts (`podman:{restart,rebuild,kill,compose}` and the docker four) that
differed only in the engine name and the override file. The engine was never the interesting part;
the `-f` list was, and it now exists in exactly one place, where choosing an engine cannot lose it.

On Podman, one line in `.env` (see `.env-example`) supplies the log path the override needs:

```dotenv
PODMAN_CONTAINERS_PATH=/home/youruser/.local/share/containers/storage/overlay-containers
```

The Podman override also swaps in `.docker/observability/promtail.podman.config.yaml`, which
parses the CRI log format.

> **Use the scripts, not a bare `compose up`.** The base file alone gives Promtail no host log
> path: it starts, tails nothing, and Loki stays empty with no error anywhere — the failure is
> completely silent, and only shows up as blank log panels in Grafana.
>
> **Do not set `COMPOSE_FILE` in `.env` to work around this.** Docker Compose honours it there,
> but podman-compose ignores it (verified 2026-08-05 against podman-compose 1.6.0), so it works
> on one runtime and silently does nothing on the other — which is why the file list lives in the
> scripts instead.

## When Kubernetes starts to make sense

You do **not** need Kubernetes for this boilerplate by default.
It becomes worth considering when the project grows into:

- multiple deploy environments with stricter secrets/policy handling,
- rolling deploys and autoscaling across several app replicas,
- multi-node scheduling for app + infra,
- platform-level health checks, ingress, and service discovery beyond one host.

Until then, Docker/Podman compose is the simpler mental model.

## Related pages

- [Runtime](./runtime.md)
- [RabbitMQ](./rabbitmq.md)
- [Prometheus](./prometheus.md)
- [Grafana](./grafana.md)
- [Package Scripts](./package-scripts.md)
