# docs/getting-started-production.md

## Purpose

Documents the production deployment path for the stack: how to build the image, configure secrets, start the four required services, and understand what production intentionally drops or changes relative to the dev compose file. It exists so a deployer can go from bare metal to a running, loopback-bound API without reverse-engineering the compose file alone.

## Key elements

- **First run** – Step-by-step: copy `.env-example`, fill in JWT secrets / metrics token / Mongo & RabbitMQ passwords, then `docker compose -f docker-compose.production.yml up -d --build`.
- **Dev vs Production table** – Side-by-side comparison of the two compose files (bind-mount vs baked image, port binding, clustering on/off, user, auth, observability presence).
- **Reverse proxy section** – Explains why the port is loopback-only and what sits in front (nginx/Caddy/Traefik/managed LB) for TLS termination.
- **Image-store caveat** – Warns that `imageStore` writes to a named volume; replicas won't share uploads; S3-compatible backend is the intended long-term fix but not yet selected.
- **Observability in production** – States the OTel/Prometheus/Grafana stack is absent by design; points to `OTEL_EXPORTER_OTLP_ENDPOINT` as the integration hook.
- **Where to go next** – Navigation table linking out to the five related docs.

## Relationships

- **docs/getting-started.md** – Linked as the dev-stack counterpart ("Run the dev stack instead").
- **docs/tools/docker-and-podman.md** – Linked for per-container details (both dev and production definitions).
- **docs/tools/observability-reference.md** – Linked for how the app communicates with OTel Collector / Prometheus / Loki / Tempo.
- **docs/tools/pairing-and-ports.md** – Linked for the full host-port ↔ env-var map.
- **docs/theory/clustering.md** – Linked for graceful-shutdown and SIGTERM behavior behind the `NODE_ENABLE_CLUSTERING=0` choice.
- **docs/reference/ops.md** – Linked for file-level lookup inside `.docker/` and the compose files.

## Notes

- The page is explicitly the *short version*; `docker-compose.production.yml` and `.docker/Dockerfile.production` are declared the source of truth for every inline decision.
- Do **not** layer the two compose files with `-f docker-compose.production.yml -f docker-compose.yml`; that drags dev bind-mounts back in. Copy individual service definitions into a separate override file instead.
- `MONGO_PASSWORD` and `RABBITMQ_PASSWORD` are deliberately missing from `.env-example` (dev Mongo is unauthenticated); the production compose file hard-fails without them.
- `NODE_ENABLE_CLUSTERING=0` is intentional: horizontal scale should come from `--scale app=N` or an orchestrator, not from in-container process duplication.
