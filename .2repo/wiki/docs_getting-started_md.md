# docs/getting-started.md

## Purpose

Step-by-step guide that takes a fresh clone to a running, seeded API stack in ~5 minutes. Exists so a new contributor (or an AI assistant setting up a sandbox) can get a working environment without reading the full docs tree first.

## Key elements

- **First run sequence** — `npm install`, copy `.env-example` → `.env`, set `NODE_TOKEN_ACCESS`/`NODE_TOKEN_REFRESH`, then `npm run compose:restart`. The `app` container auto-runs `npm run db:bootstrap` (migrate + seed) on first boot.
- **Podman log-collection vars** — `CONTAINER_LOGS_PATH`, `PROMTAIL_CONFIG`, `CONTAINER_LOG_DRIVER` must be set manually for Podman; Docker needs none of them.
- **Port table** — Maps every service (API 3000, Grafana 3001, Docs 3090, Prometheus 9090, RabbitMQ 15672, Umami 3080) to its env var; notes the 3000–3099 / 8080–8099 split between this repo and the paired frontend.
- **Contract bundle generation** — `npm run contracts:bundle -- bruno insomnia mockoon postman` produces four importable API-client files at repo root, pre-filled with seeded-DB values; files are `.gitignore`d.
- **Host mode** — `npm run host -- <script>` rewrites hostnames to `127.0.0.1` (not `localhost`, to avoid IPv6 resolver issues) while keeping the compose stack for datastores.
- **Pre-commit gate** — `npm run complete` (build + tests + lint + format) mirrors the pre-commit hook; mutation/fuzz/prism tests are intentionally excluded.
- **Navigation table** — Routes readers to the next doc based on their task.

## Relationships

- **README.md** — Upstream entry point; typically the first link a reader hits before this page.
- **docs/tools/pairing-and-ports.md** — This page defers the full port/env-var listing to that file (linked from the port table and the "go next" table).
- **docs/tools/package-scripts.md** — Cited for the mechanics of `npm run host --` and the database seed scripts.
- **docs/api/openapi-workflow.md** — Linked as the next step when modifying endpoints or payloads.
- **docs/api/regenerating.md** — Linked from both the contract-bundle section (why bundles can't rot) and the navigation table.
- **docs/theory/modules.md / docs/theory/layers.md** — Linked from the navigation table for folder-layout orientation.
- **docs/tools/tools-explained.md** — Linked from the navigation table for dependency context.
- **docs/getting-started-production.md** — Linked as the alternative path when the goal is deployment rather than local dev.
- **docs/index.md** — Serves as the docs-site index (port 3090) that lists this page.

## Notes

- **Never run bare `podman compose up`.** The npm scripts inject a Promtail `-f` override that points at the correct host log path; a bare compose start leaves Loki empty and Grafana log panels blank with no error. `COMPOSE_FILE` in `.env` does not fix this because podman-compose ignores it there.
- **`127.0.0.1`, not `localhost`, in host mode.** On dual-stack machines `localhost` can resolve to `::1` first, while Docker/Podman publish to `0.0.0.0` (IPv4 only). The mismatch surfaces as `ECONNRESET` or a silent hang, not a clear error.
- **`.env` is container-first by default.** The shipped hostnames (`database`, etc.) only resolve inside the compose network; host mode requires the `npm run host --` prefix on every command that touches a datastore.
- **Bootstrap is idempotent.** `db:bootstrap` (migrate + seed) is safe to re-run; subsequent boots are a no-op.
- **Contract bundle files are generated, not committed.** They live at repo root, are `.gitignore`d, and carry credentials that work against the seeded DB (e.g. `POST /account/login`).
