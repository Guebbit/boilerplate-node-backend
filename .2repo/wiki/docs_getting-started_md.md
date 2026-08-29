# docs/getting-started.md

## Purpose

Onboarding guide that takes a developer from a fresh clone to a browsable, seeded API in roughly five minutes. It documents the primary (container-first) setup path, a secondary host-mode path, verification steps, and a map to deeper documentation.

## Key elements

- **First-run sequence** — `npm install` → `cp .env-example .env` → `npm run compose:restart`. The `app` container auto-runs `db:bootstrap` (migrate + seed) on first boot.
- **Podman-specific env vars** — `CONTAINER_LOGS_PATH`, `PROMTAIL_CONFIG`, `CONTAINER_LOG_DRIVER` must be set in `.env` for Podman; Docker needs none.
- **Verification curls** — Health probe (`/`), seeded data (`/products`), and Prometheus exposition (`/observability/metrics`).
- **Port table** — Maps services to ports (API 3000, Grafana 3001, Docs 3090, Prometheus 9090, RabbitMQ 15672, Umami 3080) and notes this repo owns 3000–3099.
- **Contracts bundling** — `npm run contracts:bundle` generates importable request collections (Bruno, Insomnia, Mockoon, Postman) with pre-filled values matching seeded data. Output is `.gitignore`d.
- **Host mode** — `npm run host -- <script>` rewrites hostnames to `127.0.0.1` for running the API on the host against containerised databases.
- **Pre-commit gate** — `npm run complete` (build + tests + lint + format check, ~60 s) mirrors the pre-commit hook.
- **Navigation table** — Links to OpenAPI workflow, regenerating, theory, tools-explained, package-scripts, and pairing-and-ports docs.

## Relationships

- **docker/observability/otel-collector.config.yaml** — Part of the observability stack (Tempo, Loki, Prometheus, Grafana, Alloy) that the page states "only exist inside the compose stack." The page's verification step (`/observability/metrics`) and the Grafana panel at :3001 depend on this collector being wired up by the compose scripts it recommends.
- **docker/observability/tempo.config.yaml** — Tempo is explicitly listed as a compose-only service. The page's warning about bare `compose up` leaving "Grafana's log panels blank" and its recommendation to use `npm run compose:restart` (which passes the Promtail `-f` override) exist to ensure Tempo/Loki data actually flows.
- **github/workflows/ci.yml** — The page documents `npm run complete` as the gate that "is exactly what the pre-commit hook runs." The CI workflow enforces the same build/test/lint pipeline on every push, making this page the human-readable counterpart to the automated gate.

## Notes

- **Never use bare `podman compose up`.** Each npm script injects a Promtail `-f` override that gives Promtail a host log path; without it, Loki stays empty with no error. `COMPOSE_FILE` in `.env` does not compensate (podman-compose ignores it there).
- **`127.0.0.1` is intentional, not `localhost`.** On dual-stack machines `localhost` may resolve to `::1` first, while the published port is IPv4-only (`0.0.0.0`). The mismatch manifests as `ECONNRESET` or a hang with no diagnostic.
- **Container-first is the primary path.** Host mode is supported but secondary; the shipped `.env` uses compose service hostnames by design.
- **Contracts are generated, not committed.** They exist only for whoever just asked for one; see `./api/regenerating.md` for the regeneration contract.
