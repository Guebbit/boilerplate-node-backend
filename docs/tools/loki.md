# Loki

## What it is

[Grafana Loki](https://grafana.com/oss/loki/) is the **log store** of this boilerplate.
It receives container logs shipped by **Promtail** and makes them searchable in Grafana.

## How it is wired

**Docker**

```
All containers → stdout → Docker JSON log files
Docker JSON log files → Promtail → Loki → Grafana
```

- Promtail reads `/var/lib/docker/containers/*/*-json.log` on the host.
- It parses Docker's JSON envelope, then Winston's structured JSON fields (`level`, `service`, `trace_id`) as Loki labels.

**Podman (rootless, k8s-file log driver)**

```
All containers → stdout → Podman k8s-file log files (CRI format)
Podman log files → Promtail (CRI pipeline) → Loki → Grafana
```

- Promtail reads `$HOME/.local/share/containers/storage/overlay-containers/*/userdata/*.log` on the host.
- Podman's default `k8s-file` driver uses CRI format, so a separate pipeline stage is used.
- The `docker-compose.podman.yml` override wires the correct path and config automatically.
- Run `npm run podman:rebuild` (or `podman:restart`) to use the Podman-ready stack.

## Querying logs in Grafana

Open **Grafana → Explore → Loki**:

```logql
# All API logs
{service="api"}

# Errors only
{service="api", level="error"}

# Logs for a specific trace
{service="api"} | json | trace_id="abc123..."
```

## Trace ↔ log correlation

Because Winston logs include a `trace_id` field, you can:

1. Find an error trace in Grafana → Tempo.
2. Click the **Loki** link in the trace panel to jump to the exact log lines.
3. Or vice-versa: find a `trace_id` in a log line and paste it into Tempo.

## Local config

Config file: `.docker/observability/loki.config.yaml`

- Single-process mode, filesystem storage.
- Log retention: 7 days.

## Useful links

- [Loki documentation](https://grafana.com/docs/loki/latest/)
- [LogQL query language](https://grafana.com/docs/loki/latest/query/)
- [Promtail documentation](https://grafana.com/docs/loki/latest/send-data/promtail/)

## Related pages

- [Observability Reference](./observability-reference.md)
- [Grafana](./grafana.md)
- [Winston & Audit Logs](./winston.md)
- [OpenTelemetry](./opentelemetry.md)
