---
type: reference
audience: [developer]
---

# Docker & Podman: container reference

Part of [Docker & Podman](./docker-and-podman.md): every container, grouped, and where an opt-in profile fits.

## Container reference

### App runtime

| Container | Image                                                                      | Port(s)                      | Role                                                                                                                                | Read next                           |
| --------- | -------------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `app`     | `docker/Dockerfile` (node:26.13.1-trixie-slim + Chromium + baked `mongod`) | `NODE_PORT` (default `3000`) | Runs the Express API. In dev: bind-mounted source, hot-reload. Depends on `database`, `cache`, `limits`, `queue`, `otel-collector`. | [Runtime](../understand/runtime.md) |

In production `app` also carries the ceilings Chromium needs (`mem_limit: 1g`, `memswap_limit: 1g`, `pids_limit: 256`, a 256 MB `noexec` tmpfs at `/tmp`): the measurement and the reasons are in [Email & PDF rendering](../understand/email-and-rendering.md#pdf-pipeline). Under podman-compose `memswap_limit` is ignored; see [the compose provider](./docker-and-podman-podman.md#the-compose-provider-behind-podman-compose).

### Scheduler

| Container | Image               | Port(s) | Role                                                                                                                    | Read next                           |
| --------- | ------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `cron`    | `docker/Dockerfile` | none    | Runs `docker/crontab` with supercronic, the production scheduler. One replica, so two `reap:orders` passes cannot race. | [Runtime](../understand/runtime.md) |

### Core data

| Container  | Image                                          | Port(s)                                | Role                                                                                                                                                                                                                                                     | Read next                                               |
| ---------- | ---------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `database` | `mongo:9.0.4` (digest-pinned)                  | `27017`                                | Primary datastore. Persists in the named volume `boilerplate_mongodb_volume`; seeded by the `app` container's own startup command, never by a host `npm run dev` — see [Which database am I looking at?](run-locally.md#which-database-am-i-looking-at). | [MongoDB & Mongoose](../understand/mongodb-mongoose.md) |
| `cache`    | `redis:8-alpine` (digest-pinned)               | `6379`                                 | Server-side response cache. Cache is intentionally ephemeral — data is lost on restart.                                                                                                                                                                  | [Redis Cache](../understand/redis-cache.md)             |
| `limits`   | `redis:8-alpine` (digest-pinned)               | `6380` (loopback)                      | Second Redis for rate-limit counters and single-use claims. `noeviction`, so a counter is never dropped under memory pressure. The `cache` evicts freely.                                                                                                | [Redis Cache](../understand/redis-cache.md)             |
| `queue`    | `rabbitmq:4-management-alpine` (digest-pinned) | `5672` (AMQP), `15672` (management UI) | Message broker for async jobs (email, PDF generation). Management UI available in browser.                                                                                                                                                               | [RabbitMQ](../understand/rabbitmq.md)                   |

### Backups (production, opt-in)

In `compose.production.yaml`, behind the `backup` and `restore-drill` profiles
(`COMPOSE_PROFILES=bundled,backup`). Built from `docker/Dockerfile.backup`, one image for all three.

| Container          | Profile         | Role                                                                                                                                                  | Read next                                          |
| ------------------ | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `backup`           | `backup`        | supercronic running the hourly dump and file backup into restic, and the weekly prune and check. Dormant while `BACKUP_REPOSITORY` is empty. No ports | [Backups](../operate/backups.md)                   |
| `restore-drill-db` | `restore-drill` | A throwaway Mongo on a tmpfs, no auth, no published port: where the drill restores to                                                                 | [Backups](../operate/backups.md#the-restore-drill) |
| `restore-drill`    | `restore-drill` | A one-shot: restore the latest snapshot into `restore-drill-db`, compare counts, check the repository, print how long it took                         | [Backups](../operate/backups.md#the-restore-drill) |

The second machine has its own file, `compose.backup-server.yaml` (run from its own directory, on
another host): `init` (a one-shot that creates the repositories folder), `rest` (`rclone serve restic
--append-only`, the one published port) and `maintenance` (weekly `forget --prune` and `check`). See
[Backup server](../operate/backup-server.md).

All of them run read-only, with every capability dropped, as uid 1000.

### Observability stack

Behind the `observability` profile: start it with `--profile observability` or `npm run compose:up:full`.
Versions are in `compose.override.yaml`, not here; `docker/observability/validate-configs.sh` (CI `alert-rules` job) checks the Loki and production Alloy configs against the image their compose file names. Dev-only configs are not checked: a bad one fails on `compose up`.

| Container        | Role                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `otel-collector` | Single ingestion point for all OTLP telemetry from the app. Fans out traces to Tempo.                                                                                                                                |
| `tempo`          | Stores distributed traces received from the OTel Collector. Queried by Grafana.                                                                                                                                      |
| `prometheus`     | Scrapes `/observability/metrics` from the app every 15 s. Evaluates alert rules. 7-day retention.                                                                                                                    |
| `alertmanager`   | Receives firing alerts from Prometheus. Routes/groups notifications by the `ALERT_*` knobs; email goes to mailpit by default in local dev.                                                                           |
| `gatus`          | Stand-in for the off-host heartbeat service: mails mailpit when Alertmanager's `Watchdog` pings stop.                                                                                                                |
| `loki`           | Stores log lines shipped by Alloy. Queried by Grafana via LogQL. 7-day retention.                                                                                                                                    |
| `alloy`          | Tails container log files and pushes entries to Loki, and receives browser telemetry (Grafana Faro) from the frontend, fanning it into Loki and the OTel Collector. Needs `CONTAINER_LOGS_PATH` in `.env` on Podman. |
| `grafana`        | Unified UI: explore traces (Tempo), metrics (Prometheus), and logs (Loki). Anonymous admin access in local dev.                                                                                                      |

Images are in `compose.override.yaml`; the host ports are [the host port map](./pairing-and-ports.md#host-port-map).

### Analytics and docs (opt-in)

Behind the `analytics` profile: `umami` (self-hosted product analytics, see [Product Analytics](../understand/analytics.md)), its `umami-db` Postgres and a one-shot `umami-init`. Behind the `docs` profile: `docs`, the VitePress site on Nginx (`DOCS_PORT`, default `3090`).

### Integrations (opt-in)

One of four groups behind a compose **profile** in `compose.override.yaml`: `observability`, `analytics`,
`docs` and `integrations`. A plain `up` starts none of them, and `npm run compose:up:full` starts the
first three. This one is started on its own:

```bash
npm run compose -- --profile integrations up -d
```

| Container            | Image                                      | Port(s)                                                  | Role                                                                                                                                         | Read next                                                          |
| -------------------- | ------------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `webhook-tester`     | `ghcr.io/tarampampam/webhook-tester:2.3.0` | none published; reached through the proxy below          | Self-hosted webhook.site. A sink for outbound webhooks in development, showing each captured request with its headers. In-memory, no volume. | [Ports](./pairing-and-ports.md#host-port-map)                      |
| `webhook-tester-tls` | `caddy:2.11.7-alpine`                      | `WEBHOOK_TESTER_PORT` (default `3070`), loopback         | The TLS door in front of `webhook-tester`: a webhook URL must be `https://`. Serves the committed demo certificate.                          | [HTTPS in the demo](../modules/webhooks.md#https-in-the-demo)      |
| `mailpit`            | `axllent/mailpit`                          | `MAILPIT_SMTP_PORT` (`1025`), `MAILPIT_UI_PORT` (`8025`) | Local SMTP sink with a web inbox, for live e2e runs. Loopback only, in-memory, no volume.                                                    | [E-mail guard](../understand/email-and-rendering.md#the-e2e-guard) |

Nothing under `src/` imports either of them, names it, or fails when it is absent — it receives, and that is
all. It is demo furniture in the same sense as the seeded catalogue, which is why it is gated
rather than always-on.

## Service groups

| Group         | Services                                                                                     | Why they are here                                                     |
| ------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| App runtime   | `app`, `worker`, `cron`                                                                      | runs the backend, its queue consumers and its scheduled jobs          |
| Core data     | `database`, `cache`, `limits`, `queue`                                                       | persistence, cache, rate-limit counters, and async jobs               |
| Observability | `otel-collector`, `tempo`, `prometheus`, `alertmanager`, `gatus`, `loki`, `alloy`, `grafana` | traces, metrics, logs, and dashboards                                 |
| Integrations  | `webhook-tester`, `webhook-tester-tls`, `mailpit`                                            | opt-in sinks for outbound webhooks and mail; `--profile integrations` |

### The `integrations` profile is where a real consumer would go

`webhook-tester` answers _"did we send it, and what did it look like?"_ — the everyday need, and
the reason it is the default sink.

It does not answer _"can a real consumer actually use this?"_. No sink we point at ourselves can:
that claim needs a tool the audience already uses — n8n, Zapier, Make — verifying a Standard
Webhooks signature in its own environment and calling back in with an API key.

**Nothing is planned for that, deliberately.** It is recorded here because the profile is the
seam it would attach to: another service on this same group, SQLite-backed, a seeded workflow
mounted read-only, and **nothing under `src/`** — the application must not be able to tell whether
it is running. Anyone reaching for it should know the licence question comes first: n8n is
fair-code under the Sustainable Use License, where the line is internal use versus reselling, not
commercial versus non-commercial.

## Read next

- [Docker & Podman](./docker-and-podman.md)
