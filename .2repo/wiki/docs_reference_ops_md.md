# docs/reference/ops.md

## Purpose

A single reference page that catalogues every non-application-code artifact in the repo: the Docker/Podman compose stacks, the image build files, the full observability configuration chain, the data-retention policy (TTL indexes and PII scrubbing), and the CI/CD workflow files. It exists so a reader can locate the right ops file without scanning the directory tree, and to state the cross-cutting retention rules in one place.

## Key elements

- **Compose stack** — `docker-compose.yml` (dev) and `docker-compose.production.yml` (prod) define the API plus all backing services and the observability chain; a mermaid diagram shows the data-flow graph.
- **Images** — `.docker/Dockerfile` (dev, bind-mount + TS watcher), `Dockerfile.production` (multi-stage, no toolchain), `Dockerfile.docs` (VitePress + nginx), and `nginx.docs.conf`.
- **Observability configs** — one file per service in `.docker/observability/`: OTel collector, Tempo, Prometheus (+ alert rules), Alertmanager, Loki, Promtail (Docker and Podman variants), Grafana Alloy, Grafana datasources/dashboards, and `umami-init.sh`.
- **Data retention table** — TTL-index windows for `auditlogs` (90 d), `feedbackrequests` (730 d), `carts` (365 d, keyed on `updatedAt`); PII-scrub script for `orders`/`payments`; three-stage inactivity sweep for `users` (disabled by default); Loki log retention at 168 h.
- **CI workflows** — `ci.yml`, `mutation.yml`, `fuzz.yml`, `codeql.yml`, `dependabot.yml`, and `copilot-instructions.md` under `.github/`.

## Relationships

- **docs/tools/docker-and-podman.md** — the canonical guide for every compose file, Dockerfile, and the Podman-vs-Docker log-path differences called out in the Promtail/Alloy configs.
- **docs/getting-started-production.md** — the step-by-step that consumes `docker-compose.production.yml` and the production Dockerfile.
- **docs/modules/cart.md** / **docs/modules/feedback.md** — the module docs that own the application logic behind the `carts` and `feedbackrequests` TTL collections.
- **docs/theory/data-protection.md** — the lawful-basis, subject-request, and breach-runbook layer that sits on top of every retention window listed here.
- **docs/tools/analytics.md** — the product-analytics guide that explains what `umami-init.sh` bootstraps.
- **docs/tools/fuzz-testing.md** — explains what the `fuzz.yml` workflow exercises.
- **docs/reference/index.md** — the hub that links this page alongside `root.md`, `src-app.md`, `src-modules.md`, and `data.md`.

## Notes

- **TTL index caveat:** Mongo does **not** alter an existing TTL index's `expireAfterSeconds` when the env var changes. Changing `NODE_*_RETENTION_DAYS` on a live database is a no-op until the index is dropped and recreated via a `collMod` migration under `db/migrations/`. Restarting is not enough.
- **`orders` and `payments` must never be TTL-deleted**; they are kept for tax/commercial-law reasons and instead PII-scrubbed in place by `npm run reap:orders`.
- **`users` inactivity sweep is disabled by default** (`NODE_INACTIVE_ACCOUNT_DAYS=0`); the three-stage (warn → soft-delete → hard-delete) design is documented in the script header, not here.
- **Loki retention is not env-driven** — it is hardcoded in `loki.config.yaml` at 168 h for the local stack and tuned independently in production.
- **Podman vs Docker** — `promtail.podman.config.yaml` exists separately because container log paths and the socket differ; the compose file selects by environment, not by a runtime flag inside Promtail.
- **`.dockerignore` matters for build size** — the reports directory alone is tens of megabytes of mutation HTML and would be copied into every build context otherwise.
