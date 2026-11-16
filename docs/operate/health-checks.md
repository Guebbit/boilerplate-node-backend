---
type: concept
audience: [operator]
---

# Health checks

A container health check is a command Docker runs on a timer. Docker records `healthy` or
`unhealthy`, and other tools act on that word. This page says what each container's check tests,
and why it never tests more.

## The rule: one container, one job, one check

A health check tests **this container's own job**. Nothing else.

- **A web container** checks that the web process answers: `GET /livez`.
- **A long-running worker** checks its own loop, not the web port. `cron` asks supercronic's
  `/health`. Mastodon's `sidekiq` and Sentry's workers do the same.
  That loop is alive even when every job would refuse a bad environment, so `cron` runs
  `config:check` (`scripts/ops/check-config.ts`) before supercronic starts: a broken `.env` stops the container instead.
- **A one-shot job** has no check. Its exit code is the signal, and
  `depends_on: service_completed_successfully` already reads it. `setup` sets `disable: true`.
- **A container never inherits a check for a job it does not do.** It could never pass. That is a
  permanent false alarm, and under Swarm a restart loop.

| Container  | Its check                                       | Where declared                                       |
| ---------- | ----------------------------------------------- | ---------------------------------------------------- |
| `app`      | `GET /livez`                                    | the image, and compose again (see [Podman](#podman)) |
| `cron`     | supercronic's `GET /health` on `127.0.0.1:9746` | compose                                              |
| `backup`   | the same supercronic `/health`, with `curl`     | `docker/Dockerfile.backup` (the image)               |
| `setup`    | none: `healthcheck: disable: true`              | `compose.production.yaml`                            |
| `database` | the database's own ping                         | compose                                              |
| `cache`    | the cache's own ping                            | compose                                              |
| `queue`    | the broker's own diagnostics                    | compose                                              |

## Liveness and readiness

Two questions, two endpoints.

```mermaid
flowchart LR
    docker["Docker / Swarm / ECS<br/>container HEALTHCHECK"] -->|every 30 s| livez["GET /livez<br/>is the process up"]
    lb["a load balancer's own probe<br/>(k8s readinessProbe, ALB, Traefik)"] -->|every few s| readyz["GET /readyz<br/>booted, not draining, Mongo connected"]
    livez -->|fails| restart["restart or replace the container"]
    readyz -->|fails| route["stop routing traffic here"]
```

| Endpoint                    | Answers                                                 | I/O  | Read by                           |
| --------------------------- | ------------------------------------------------------- | ---- | --------------------------------- |
| `GET /livez`                | Is the process up?                                      | none | every container HEALTHCHECK       |
| `GET /readyz`               | Should this instance receive traffic right now?         | none | a load balancer's own probe, only |
| `GET /`                     | The client-facing ping (the frontend's API-down banner) | none | a browser, never an orchestrator  |
| `GET /observability/health` | What exactly is missing? Admin only                     | some | an operator or a dashboard        |

Liveness never looks at a dependency:

- Spring Boot: a failing external system "would trigger massive restarts and cascading failures".
  [docs](https://docs.spring.io/spring-boot/reference/features/spring-application.html)
- Kubernetes: liveness must "truly indicate unrecoverable application failure".
  [docs](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)
- Microsoft's Health Endpoint Monitoring keeps the shallow and deep checks on separate endpoints.
  [pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/health-endpoint-monitoring)

A restart does not bring a downed Mongo back. So `/readyz` (which reads the Mongo connection) is
never a container check.

### Who reads Docker's HEALTHCHECK

| Platform                  | What "unhealthy" does                                                             |
| ------------------------- | --------------------------------------------------------------------------------- |
| Plain Docker              | status only; restart policies act on exit, not health. `service_healthy` reads it |
| Docker Swarm              | kills and replaces the task                                                       |
| Traefik (Docker provider) | drops the container from routing                                                  |
| ECS / Fargate             | replaces the task, if the check is in the task definition                         |
| Podman                    | only for images built with `--format docker`; the default OCI format drops it     |
| Kubernetes                | ignores it. Use `livenessProbe` and `readinessProbe`                              |

## Readiness at the load balancer

A proxy does **not** read `/readyz` unless you configure it to. There is one `app` replica on one
host, so an unready instance has nowhere else to send traffic, and a proxy's own 503 carries no CORS
headers, so the SPA would see a network error, not a readable one.

With an orchestrator in front of several replicas, point its readiness probe at `/readyz` (a
Kubernetes `readinessProbe`, an ALB target-group health check). Those probes stop sending traffic to
an unready replica; a plain proxy health check is the same idea, one path to configure.

`/readyz` answers 503 from the moment a shutdown signal arrives, but `server.close()` runs in the
same tick, so no probe sees it yet. A lame-duck delay between the two belongs with this change.

## Kubernetes and PaaS

| Here                 | There                                   |
| -------------------- | --------------------------------------- |
| `app` `GET /livez`   | `livenessProbe`                         |
| `app` `GET /readyz`  | `readinessProbe`                        |
| a startup wait       | `startupProbe` (optional; not built)    |
| `cron` (supercronic) | a `CronJob`, one per schedule. No probe |
| `setup`              | a `Job`, or a pre-upgrade hook          |

## Podman

Podman builds OCI images by default, and OCI has no `HEALTHCHECK`. So the `app` service repeats the
check in `compose.production.yaml` instead of leaning on the image. The compose block works
on both engines.

## Supercronic's `/health`

`cron` and `backup` start supercronic with `-prometheus-listen-address 127.0.0.1:9746`. That serves `/health`,
which answers `OK` while the scheduler runs, and `/metrics` (success and failure counters per job).
The loopback bind keeps both private to the container. `backup` is a second scheduler in a second container, on purpose: it holds the backup secrets and the app's `cron` does not ([Backups](./backups.md)). Scraping `/metrics` needs a non-loopback
bind, which is not set up.
[source](https://github.com/aptible/supercronic/blob/master/prometheus_metrics/prommetrics.go)

Related: [The Observability Layer](../understand/observability-layer.md), [Docker & Podman](../build/docker-and-podman.md).

## Read next

- [Deploy and rollback](./deploy-and-rollback.md)
- [Observability Stack Reference](./observability-reference.md)
