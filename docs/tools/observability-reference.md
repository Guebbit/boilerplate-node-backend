# Observability Stack Reference

This page is the quick map of the boilerplate observability stack and the most common config settings.

## Architecture at a glance

```mermaid
flowchart LR
    App[Node API app] -->|OTLP traces| OTel[OpenTelemetry Collector]
    OTel -->|traces| Tempo[Tempo]
    App -->|/metrics| Prom[Prometheus]
    Prom -->|alerts| Alert[Alertmanager]
    DockerLogs[Docker container logs] --> Promtail[Promtail]
    Promtail --> Loki[Loki]
    Tempo --> Grafana[Grafana]
    Prom --> Grafana
    Loki --> Grafana
```

## Official docs (quick links)

- Prometheus: [overview](https://prometheus.io/docs/introduction/overview/), [scraping](https://prometheus.io/docs/prometheus/latest/configuration/configuration/#scrape_config), [alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/), [PromQL](https://prometheus.io/docs/prometheus/latest/querying/basics/)
- Alertmanager: [overview](https://prometheus.io/docs/alerting/latest/alertmanager/), [routing](https://prometheus.io/docs/alerting/latest/configuration/#route), [grouping](https://prometheus.io/docs/alerting/latest/configuration/#route), [receivers](https://prometheus.io/docs/alerting/latest/configuration/#receiver)
- Grafana: [docs](https://grafana.com/docs/grafana/latest/), [datasources](https://grafana.com/docs/grafana/latest/datasources/), [provisioning](https://grafana.com/docs/grafana/latest/administration/provisioning/), [dashboards](https://grafana.com/docs/grafana/latest/dashboards/)
- Tempo: [docs](https://grafana.com/docs/tempo/latest/), [receivers](https://grafana.com/docs/tempo/latest/configuration/), [storage](https://grafana.com/docs/tempo/latest/configuration/#storage), [retention](https://grafana.com/docs/tempo/latest/configuration/#compactor)
- Loki: [docs](https://grafana.com/docs/loki/latest/), [ingestion](https://grafana.com/docs/loki/latest/get-started/architecture/), [schema](https://grafana.com/docs/loki/latest/operations/storage/schema/), [retention](https://grafana.com/docs/loki/latest/operations/storage/retention/)
- Promtail: [docs](https://grafana.com/docs/loki/latest/send-data/promtail/), [scrape configs](https://grafana.com/docs/loki/latest/send-data/promtail/configuration/#scrape_configs), [pipeline stages](https://grafana.com/docs/loki/latest/send-data/promtail/stages/)
- OpenTelemetry Collector: [docs](https://opentelemetry.io/docs/collector/), [receivers](https://opentelemetry.io/docs/collector/configuration/#receivers), [processors](https://opentelemetry.io/docs/collector/configuration/#processors), [exporters](https://opentelemetry.io/docs/collector/configuration/#exporters)

## Tool-by-tool config reference

### Prometheus

**What it does:** scrapes metrics, evaluates alert rules, forwards alerts.

Repo files: [`/.docker/observability/prometheus.config.yaml`](../../.docker/observability/prometheus.config.yaml), [`/.docker/observability/prometheus.alert-rules.yaml`](../../.docker/observability/prometheus.alert-rules.yaml)

| Config section | What it does | Why local value | Common tweak | Dev vs prod |
| --- | --- | --- | --- | --- |
| `global.scrape_interval`, `evaluation_interval` | scrape/evaluate cadence | `15s` keeps feedback quick | increase to reduce laptop load | prod often 15-60s by target criticality |
| `scrape_configs` | scrape targets (`app`, `otel-collector`) | static docker service names are simple locally | add more jobs/targets | prod usually uses service discovery |
| `rule_files` | loads alert rules | keeps rules versioned in repo | split rules by domain | prod often adds recording rules |
| `alerting.alertmanagers` | sends firing alerts | points to local Alertmanager | switch target/HA endpoints | prod commonly has multiple replicas |

### Alertmanager

**What it does:** groups/routes alerts to notification receivers.

Repo file: [`/.docker/observability/alertmanager.config.yaml`](../../.docker/observability/alertmanager.config.yaml)

| Config section | What it does | Why local value | Common tweak | Dev vs prod |
| --- | --- | --- | --- | --- |
| `route.group_by/group_wait/group_interval/repeat_interval` | groups and throttles notifications | avoids spam while testing | adjust batching cadence | prod tunes by team/on-call needs |
| `route.receiver` + `receivers` | final notification destination | `null` receiver prevents accidental emails/Slack | add Slack/email/webhook receiver | prod uses real receivers + secrets |
| `global.resolve_timeout` | resolve timeout behavior | safe default (`5m`) | tune for noisy alerts | prod often aligned with incident policy |

### Grafana

**What it does:** unified UI for metrics, logs, traces.

Repo files: [`/.docker/observability/grafana.datasources.yaml`](../../.docker/observability/grafana.datasources.yaml), [`/.docker/observability/grafana.dashboard-providers.yaml`](../../.docker/observability/grafana.dashboard-providers.yaml), [`/.docker/observability/grafana/dashboards/api-traces.json`](../../.docker/observability/grafana/dashboards/api-traces.json)

| Config section | What it does | Why local value | Common tweak | Dev vs prod |
| --- | --- | --- | --- | --- |
| `datasources[]` | provisions Tempo/Prometheus/Loki at startup | no manual UI setup on each restart | add auth headers / extra datasources | prod often adds RBAC, auth, cloud backends |
| `tracesToLogsV2`, `tracesToMetrics`, `derivedFields` | enables cross-signal jumps | fast local debugging workflow | map labels to your service naming | prod requires strict label consistency |
| `providers[].options.path` | auto-loads dashboard JSON files | keeps dashboards in git | add folders/providers | prod may split folders/org permissions |

### Tempo

**What it does:** stores and serves distributed traces.

Repo file: [`/.docker/observability/tempo.config.yaml`](../../.docker/observability/tempo.config.yaml)

| Config section | What it does | Why local value | Common tweak | Dev vs prod |
| --- | --- | --- | --- | --- |
| `distributor.receivers.otlp` | listens for OTLP ingest | accepts gRPC+HTTP locally | disable unused protocol | prod often fronted by gateway/load balancer |
| `storage.trace.backend/local/wal` | trace persistence paths | simple local filesystem | move to bigger local volume | prod usually object storage (S3/GCS/etc.) |
| `compactor.compaction.block_retention` | retention/compaction window | `24h` keeps disk usage small | increase for longer local analysis | prod often much longer retention |

### Loki

**What it does:** stores indexed logs and serves LogQL queries.

Repo file: [`/.docker/observability/loki.config.yaml`](../../.docker/observability/loki.config.yaml)

| Config section | What it does | Why local value | Common tweak | Dev vs prod |
| --- | --- | --- | --- | --- |
| `schema_config` | index/storage schema config | TSDB `v13` is current local baseline | update when upgrading Loki | prod changes need planned migrations |
| `storage_config.filesystem` | where chunks/index are stored | low-friction local disk | mount persistent volume | prod usually object storage + index shipper |
| `limits_config.retention_period` + `compactor.retention_enabled` | log retention enforcement | `168h` keeps one week logs | shorter retention if disk constrained | prod retention follows compliance/cost rules |
| `ruler.alertmanager_url` | forwards Loki alerts | wired to local Alertmanager | add rule files and enable alerts | prod typically HA Alertmanager |

### Promtail

**What it does:** tails log files and pushes entries to Loki.

Repo file: [`/.docker/observability/promtail.config.yaml`](../../.docker/observability/promtail.config.yaml)

| Config section | What it does | Why local value | Common tweak | Dev vs prod |
| --- | --- | --- | --- | --- |
| `scrape_configs[].labels.__path__` | filesystem path to tail | Docker JSON log path works in local compose | add extra paths/jobs | prod often uses Kubernetes discovery |
| `pipeline_stages` | transforms/parses entries before send | basic docker + regex pipeline | add json/timestamp/labels stages | prod pipelines are usually richer and normalized |
| `positions.filename` | stores read offsets | avoids rereading on restart | change to persistent mount | prod keeps positions on durable storage |

### OpenTelemetry Collector

**What it does:** receives telemetry, processes it, exports it to backends.

Repo file: [`/.docker/observability/otel-collector.config.yaml`](../../.docker/observability/otel-collector.config.yaml)

| Config section | What it does | Why local value | Common tweak | Dev vs prod |
| --- | --- | --- | --- | --- |
| `receivers.otlp` | ingest endpoint from instrumented apps | gRPC+HTTP support for flexibility | keep only one protocol if desired | prod often receives from many services |
| `processors.batch` | batches spans before export | better performance with low complexity | add memory/resource processors | prod commonly adds resource/attributes/tail sampling |
| `exporters.otlp` + `service.pipelines.traces` | sends traces to Tempo and wires trace pipeline | direct local network path | add extra exporters (vendor/cloud) | prod often fans out to multiple backends |

## Common tasks

- **View traces:** Grafana → Explore → Tempo → query `service.name="api"` (related: [Tempo](./tempo.md)).
- **Query metrics:** Grafana Explore (Prometheus) or Prometheus UI (`http://localhost:9090`) with `up{job="api"}`.
- **Filter logs:** Grafana Explore (Loki) with `{job="containerlogs"} |= "error"`.
- **Create alerts:** add/modify rules in [`prometheus.alert-rules.yaml`](../../.docker/observability/prometheus.alert-rules.yaml), then reload/restart Prometheus and verify in Alertmanager UI (`http://localhost:9093`).

## FAQ / troubleshooting

- **No traces visible in Grafana**
  - Check app env `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318`.
  - Check collector and tempo containers are running.
- **No logs in Loki**
  - Check Promtail can read `/var/lib/docker/containers/*/*-json.log`.
  - Verify `clients.url` points to `http://loki:3100/loki/api/v1/push`.
- **Prometheus target is down**
  - Open Prometheus → *Status > Targets* and verify `app:3000/metrics`.
  - Confirm app container and `/metrics` endpoint are up.
- **Too much local alert noise**
  - Increase alert `for:` windows and/or lower local scrape frequency.
  - Keep Alertmanager on `null` receiver in local dev.

## Related tool pages

- [Prometheus](./prometheus.md)
- [OpenTelemetry](./opentelemetry.md)
- [Tempo](./tempo.md)
- [Grafana](./grafana.md)
- [Loki](./loki.md)
