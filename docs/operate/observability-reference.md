# Observability Stack Reference

This page is the quick map of the boilerplate observability stack and the most common config settings.

## Architecture at a glance

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 55, 'rankSpacing': 75}}}%%
flowchart LR
    App["Node API app\n:3000"]

    subgraph Traces["Traces"]
        OTel["OTel Collector\n:4318 HTTP · :4317 gRPC"]
        Tempo["Tempo\ntrace storage"]
        OTel --> Tempo
    end

    subgraph Metrics["Metrics"]
        Prom["Prometheus\n:9090"]
        Alert["Alertmanager\n:9093"]
        Prom -->|"firing alerts"| Alert
    end

    subgraph Logs["Logs"]
        Stdout["stdout\n(container log file)"]
        Alloy["Alloy\nlog shipper"]
        Loki["Loki\n:3100"]
        Stdout --> Alloy --> Loki
    end

    Grafana["Grafana\n:3001"]

    App -->|"OTLP/HTTP traces"| OTel
    App -->|"Winston → stdout"| Stdout
    Prom -->|"scrape /observability/metrics"| App
    Tempo --> Grafana
    Prom --> Grafana
    Loki --> Grafana

    classDef app fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef traces fill:#ede9fe,stroke:#7c3aed,color:#111827;
    classDef metrics fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef logs fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef ui fill:#fce7f3,stroke:#db2777,color:#111827;

    class App app;
    class OTel,Tempo traces;
    class Prom,Alert metrics;
    class Stdout,Alloy,Loki logs;
    class Grafana ui;
```

### Signal roles at a glance

| Signal      | Path                                                        | Storage                 | Query UI                                                  | Dedicated page                                            |
| ----------- | ----------------------------------------------------------- | ----------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| **Traces**  | App → OTel Collector → Tempo                                | Tempo volume            | Grafana → Explore → Tempo                                 | [OpenTelemetry](./opentelemetry.md) · [Tempo](./tempo.md) |
| **Metrics** | Prometheus scrapes `/observability/metrics` → Prometheus DB | Prometheus volume (7 d) | Grafana → Explore → Prometheus or `http://localhost:9090` | [Prometheus](./prometheus.md)                             |
| **Logs**    | Winston → stdout → Alloy → Loki                             | Loki volume (7 d)       | Grafana → Explore → Loki                                  | [Winston](./winston.md) · [Loki](./loki.md)               |
| **Alerts**  | Prometheus evaluates rules → Alertmanager                   | in-memory               | `http://localhost:9093`                                   | [Prometheus](./prometheus.md)                             |

## Tool-by-tool config reference

### Prometheus

**What it does:** scrapes metrics, evaluates alert rules, forwards alerts.

Repo files: [`docker/observability/prometheus.config.yaml`](https://github.com/Guebbit/boilerplate-node-backend/blob/main/docker/observability/prometheus.config.yaml), [`docker/observability/prometheus.alert-rules.yaml`](https://github.com/Guebbit/boilerplate-node-backend/blob/main/docker/observability/prometheus.alert-rules.yaml)

| Config section                                  | What it does                                                                                         | Why local value                                | Common tweak                   | Dev vs prod                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------ | --------------------------------------- |
| `global.scrape_interval`, `evaluation_interval` | scrape/evaluate cadence                                                                              | `15s` keeps feedback quick                     | increase to reduce laptop load | prod often 15-60s by target criticality |
| `scrape_configs`                                | scrape targets (`api`, `otel-collector`, `otel-collector-spanmetrics`, `prometheus`, `alertmanager`) | static docker service names are simple locally | add more jobs/targets          | prod usually uses service discovery     |
| `rule_files`                                    | loads alert rules                                                                                    | keeps rules versioned in repo                  | split rules by domain          | prod often adds recording rules         |
| `alerting.alertmanagers`                        | sends firing alerts                                                                                  | points to local Alertmanager                   | switch target/HA endpoints     | prod commonly has multiple replicas     |

### Alertmanager

**What it does:** groups/routes alerts to notification receivers.

Repo file: [`docker/observability/alertmanager.config.template.yaml`](https://github.com/Guebbit/boilerplate-node-backend/blob/main/docker/observability/alertmanager.config.template.yaml)

| Config section                                             | What it does                       | Why local value                                  | Common tweak                     | Dev vs prod                             |
| ---------------------------------------------------------- | ---------------------------------- | ------------------------------------------------ | -------------------------------- | --------------------------------------- |
| `route.group_by/group_wait/group_interval/repeat_interval` | groups and throttles notifications | avoids spam while testing                        | adjust batching cadence          | prod tunes by team/on-call needs        |
| `route.receiver` + `receivers`                             | final notification destination     | `null` receiver prevents accidental emails/Slack | add Slack/email/webhook receiver | prod uses real receivers + secrets      |
| `global.resolve_timeout`                                   | resolve timeout behavior           | safe default (`5m`)                              | tune for noisy alerts            | prod often aligned with incident policy |

### Grafana

**What it does:** unified UI for metrics, logs, traces.

Repo files: [`docker/observability/grafana.datasources.yaml`](https://github.com/Guebbit/boilerplate-node-backend/blob/main/docker/observability/grafana.datasources.yaml), [`docker/observability/grafana.dashboard-providers.yaml`](https://github.com/Guebbit/boilerplate-node-backend/blob/main/docker/observability/grafana.dashboard-providers.yaml), [`docker/observability/grafana/dashboards/api-traces.json`](https://github.com/Guebbit/boilerplate-node-backend/blob/main/docker/observability/grafana/dashboards/api-traces.json)

| Config section                    | What it does                                | Why local value                    | Common tweak                         | Dev vs prod                                |
| --------------------------------- | ------------------------------------------- | ---------------------------------- | ------------------------------------ | ------------------------------------------ |
| `datasources[]`                   | provisions Tempo/Prometheus/Loki at startup | no manual UI setup on each restart | add auth headers / extra datasources | prod often adds RBAC, auth, cloud backends |
| `tracesToLogsV2`, `derivedFields` | enables cross-signal jumps                  | fast local debugging workflow      | map labels to your service naming    | prod requires strict label consistency     |
| `providers[].options.path`        | auto-loads dashboard JSON files             | keeps dashboards in git            | add folders/providers                | prod may split folders/org permissions     |

### Tempo

**What it does:** stores and serves distributed traces.

Repo file: [`docker/observability/tempo.config.yaml`](https://github.com/Guebbit/boilerplate-node-backend/blob/main/docker/observability/tempo.config.yaml)

| Config section                         | What it does                | Why local value              | Common tweak                       | Dev vs prod                                 |
| -------------------------------------- | --------------------------- | ---------------------------- | ---------------------------------- | ------------------------------------------- |
| `distributor.receivers.otlp`           | listens for OTLP ingest     | accepts gRPC+HTTP locally    | disable unused protocol            | prod often fronted by gateway/load balancer |
| `storage.trace.backend/local/wal`      | trace persistence paths     | simple local filesystem      | move to bigger local volume        | prod usually object storage (S3/GCS/etc.)   |
| `compactor.compaction.block_retention` | retention/compaction window | `24h` keeps disk usage small | increase for longer local analysis | prod often much longer retention            |

### Loki

**What it does:** stores indexed logs and serves LogQL queries.

Repo file: [`docker/observability/loki.config.yaml`](https://github.com/Guebbit/boilerplate-node-backend/blob/main/docker/observability/loki.config.yaml)

| Config section                                                   | What it does                  | Why local value                      | Common tweak                          | Dev vs prod                                  |
| ---------------------------------------------------------------- | ----------------------------- | ------------------------------------ | ------------------------------------- | -------------------------------------------- |
| `schema_config`                                                  | index/storage schema config   | TSDB `v13` is current local baseline | update when upgrading Loki            | prod changes need planned migrations         |
| `storage_config.filesystem`                                      | where chunks/index are stored | low-friction local disk              | mount persistent volume               | prod usually object storage + index shipper  |
| `limits_config.retention_period` + `compactor.retention_enabled` | log retention enforcement     | `168h` keeps one week logs           | shorter retention if disk constrained | prod retention follows compliance/cost rules |
| `ruler.alertmanager_url`                                         | forwards Loki alerts          | wired to local Alertmanager          | add rule files and enable alerts      | prod typically HA Alertmanager               |

### Alloy (container logs)

**What it does:** tails log files and pushes entries to Loki. The dev and production stacks load the same file.

Repo file: [`docker/observability/alloy.logs.config.alloy`](https://github.com/Guebbit/boilerplate-node-backend/blob/main/docker/observability/alloy.logs.config.alloy)

It reads both runtimes at once, so nothing selects a config: Docker's `json-file` driver (JSON envelope) and Podman's `k8s-file` driver (CRI format). `CONTAINER_LOGS_PATH` in `.env` supplies the host log directory and defaults to docker's — see [Docker & Podman](../build/docker-and-podman.md).

| Config block                 | What it does                       | Why local value                              | Common tweak                   | Dev vs prod                         |
| ---------------------------- | ---------------------------------- | -------------------------------------------- | ------------------------------ | ----------------------------------- |
| `local.file_match`           | filesystem glob to tail            | one block per engine, under the fixed mount  | add extra paths/jobs           | same file in both stacks            |
| `stage.docker` / `stage.cri` | unwrap the engine's envelope       | the glob that matches nothing is harmless    | none                           | same file in both stacks            |
| `loki.process "app"`         | parse Winston JSON, promote labels | `level`, `service`, `log_type` become labels | add a label (mind cardinality) | same file in both stacks            |
| `loki.write`                 | push endpoint                      | `http://loki:3100/loki/api/v1/push`          | point at another Loki          | prod keeps read offsets in a volume |

### OpenTelemetry Collector

**What it does:** receives telemetry, processes it, exports it to backends.

Repo file: [`docker/observability/otel-collector.config.yaml`](https://github.com/Guebbit/boilerplate-node-backend/blob/main/docker/observability/otel-collector.config.yaml)

| Config section                                | What it does                                   | Why local value                        | Common tweak                       | Dev vs prod                                          |
| --------------------------------------------- | ---------------------------------------------- | -------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `receivers.otlp`                              | ingest endpoint from instrumented apps         | gRPC+HTTP support for flexibility      | keep only one protocol if desired  | prod often receives from many services               |
| `processors.batch`                            | batches spans before export                    | better performance with low complexity | add memory/resource processors     | prod commonly adds resource/attributes/tail sampling |
| `exporters.otlp` + `service.pipelines.traces` | sends traces to Tempo and wires trace pipeline | direct local network path              | add extra exporters (vendor/cloud) | prod often fans out to multiple backends             |

## Common tasks

- **View traces:** [Grafana](./grafana.md) → Explore → [Tempo](./tempo.md) → query `service.name="api"`. See [TraceQL](https://grafana.com/docs/tempo/latest/traceql/) for advanced queries.
- **Query metrics:** Grafana Explore ([Prometheus](./prometheus.md)) or `http://localhost:9090` with `up{job="api"}`. See [PromQL basics](https://prometheus.io/docs/prometheus/latest/querying/basics/) for query syntax.
- **Filter logs:** Grafana Explore ([Loki](./loki.md)) with `{job="docker"} |= "error"`. See [LogQL](https://grafana.com/docs/loki/latest/query/) for query syntax.
- **Create alerts:** add/modify rules in [`prometheus.alert-rules.yaml`](https://github.com/Guebbit/boilerplate-node-backend/blob/main/docker/observability/prometheus.alert-rules.yaml), then reload/restart [Prometheus](./prometheus.md) and verify in Alertmanager UI (`http://localhost:9093`).

## FAQ / troubleshooting

- **No traces visible in Grafana**
    - Check app env `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318`.
    - Check collector and tempo containers are running.
- **No logs in Loki**
    - Check Alloy can read `/var/lib/docker/containers/*/*-json.log`.
    - Verify `loki.write` `endpoint.url` points to `http://loki:3100/loki/api/v1/push`.
- **Prometheus target is down**
    - Open Prometheus → _Status > Targets_ and verify `app:3000/observability/metrics`.
    - Confirm app container and `/observability/metrics` endpoint are up.
- **Too much local alert noise**
    - Increase alert `for:` windows and/or lower local scrape frequency.
    - Keep Alertmanager on `null` receiver in local dev.

## Related tool pages

- [Events & Logging](../understand/events-and-logging.md) — what the application emits, before it reaches any of the above
- [Prometheus](./prometheus.md)
- [OpenTelemetry](./opentelemetry.md)
- [Tempo](./tempo.md)
- [Grafana](./grafana.md)
- [Loki](./loki.md)
