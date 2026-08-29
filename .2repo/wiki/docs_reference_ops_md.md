# docs/reference/ops.md

## Purpose

A reference index for every non-application-code asset in the repository: the Docker compose stacks, Dockerfiles, the full observability config chain, CI/CD workflows, rendered EJS templates, and static public assets. It exists so a reader (human or AI) can locate and understand an operational file by name without searching the tree.

## Key elements

- **The compose stack** — documents `docker-compose.yml` (dev) and `docker-compose.production.yml`, plus `.dockerignore`; includes a Mermaid flowchart of the service topology (api → mongo/redis/rabbitmq → otel/prometheus/loki/tempo → grafana).
- **Images** — the three Dockerfiles under `.docker/` (dev, production, docs) and the nginx config for the docs image.
- **The observability stack** — one-row-per-file table covering otel-collector, tempo, prometheus (config + alert rules), alertmanager, loki, promtail (Docker + Podman variants), Grafana Alloy, Grafana provisioning (datasources, dashboard providers, the API-traces dashboard JSON), and the Umami init script.
- **CI** — tables for `.github/workflows/ci.yml`, `mutation.yml`, `fuzz.yml`, `codeql.yml`, plus `dependabot.yml` and `copilot-instructions.md`.
- **Rendered templates** — the EJS email, file (PDF), and layout templates under `shared/views/`.
- **Served assets** — the `public/` directory contents (CSS, images, etc.).

## Relationships

- **`docker-compose.yml`** — the primary artifact this page documents; the compose file mounts the observability configs, the Dockerfiles, and the template directories described here.
- **`docs/reference/index.md`** — the parent index; this page is one of its child entries and is reached from there via the "Ops & Assets" link.
- **`github/workflows/ci.yml`** — the CI gate this page describes in the CI section; the workflow itself defines the build/lint/test steps that `ci.yml` runs on every push and PR.

## Notes

- Each table row includes a "Read next" column pointing to the detailed how-to under `docs/tools/`. This page is deliberately a *what/where* index; the *how* lives one level deeper.
- The `promtail.podman.config.yaml` exists specifically because Podman's container log paths and socket differ from Docker's — the two are not interchangeable.
- `public/` is a tracked directory; `.gitignore` excludes user uploads from it. Anything a user uploads would land in a path under version control.
