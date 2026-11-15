---
type: task
audience: [operator]
---

# Loki

## What it is

[Grafana Loki](https://grafana.com/oss/loki/) is the **log store** of this boilerplate.
It receives container logs shipped by **Alloy** and makes them searchable in Grafana.

## How it is wired

**Docker**

```
All containers → stdout → Docker JSON log files
Docker JSON log files → Alloy → Loki → Grafana
```

- Alloy reads `/var/lib/docker/containers/*/*-json.log` on the host.
- It parses Docker's JSON envelope, then Winston's structured JSON fields (`level`, `service.name`, `trace_id`) as Loki labels; the `service` label is read from `service.name`, the
  OpenTelemetry name the logger writes. See [Winston](./winston.md#field-names-in-the-log-line).

**Podman (rootless, k8s-file log driver)**

```
All containers → stdout → Podman k8s-file log files (CRI format)
Podman log files → Alloy (CRI stage) → Loki → Grafana
```

- Alloy reads `$HOME/.local/share/containers/storage/overlay-containers/*/userdata/*.log` on the host.
- Podman's default driver is `journald`, which writes no log file — set `CONTAINER_LOG_DRIVER=k8s-file` or Alloy tails nothing.
- `k8s-file` uses CRI format; `alloy.logs.config.alloy` reads both framings at once, so nothing selects a parser.
- `CONTAINER_LOGS_PATH` in `.env` points Alloy at that path.
- Run `npm run compose:rebuild` (or `compose:restart`) to use the Podman-ready stack.

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

::: warning Those labels depend on the log line being JSON
`service` and `level` are not attached by Loki — Alloy parses each line as JSON and promotes
the fields out of it. So the queries above work only while the app is emitting JSON, which is why
`resolveConsoleFormat` also checks `process.stdout.isTTY`, not `NODE_ENV` alone: a container has no
TTY and gets JSON, a developer's terminal gets the colourised layout. Key that choice off
`NODE_ENV` only and the compose stack (`NODE_ENV=development`) ships colourised prose — the
lines still arrive in Loki, but carry no labels and match none of these selectors, with no error
anywhere to say so.
:::

## Trace ↔ log correlation {#trace-log-correlation}

Because Winston logs include a `trace_id` field, you can:

1. Find an error trace in Grafana → Tempo.
2. Click the **Loki** link in the trace panel to jump to the exact log lines.
3. Or vice-versa: find a `trace_id` in a log line and paste it into Tempo.

## Local config

Config file: `docker/observability/loki.config.yaml`

- Single-process mode, filesystem storage.
- Log retention: 7 days.

## Works with

- **[Winston](./winston.md)** — Winston writes structured JSON to stdout; Alloy tails those container log files and ships them here. Without Winston's `trace_id` field there would be no link between log lines and traces.
- **[Tempo](./tempo.md)** — log lines carry `trace_id`; Grafana uses it to jump from a Loki log entry to the Tempo trace for that request, and back. → [Trace ↔ log correlation](#trace-log-correlation)
- **[Grafana](./grafana.md)** — Loki is queried exclusively through Grafana's Explore view. Grafana also reads the `trace_id` derived field to render the clickable Tempo link next to each log line.

## External references

- [LogQL query language](https://grafana.com/docs/loki/latest/query/) — needed to write log queries in [Grafana](./grafana.md) Explore beyond the examples above

## Related pages

- [Observability Reference](./observability-reference.md)
- [Grafana](./grafana.md)
- [Winston & Audit Logs](./winston.md)
- [OpenTelemetry](./opentelemetry.md)
