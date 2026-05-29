# Loki

## What it is

[Grafana Loki](https://grafana.com/oss/loki/) is the **log store** of this boilerplate.
It receives container logs shipped by **Promtail** and makes them searchable in Grafana.

## How it is wired

```
All containers → stdout → Docker JSON log files
Docker JSON log files → Promtail → Loki → Grafana
```

- Promtail reads `/var/lib/docker/containers/*/*-json.log` on the host.
- It parses Winston's structured JSON fields (`level`, `service`, `trace_id`) as Loki labels.
- Grafana auto-provisions Loki as a datasource with a `trace_id` derived field linking to Tempo.

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

- [Grafana](./grafana.md)
- [Winston & Audit Logs](./winston.md)
- [OpenTelemetry](./opentelemetry.md)
