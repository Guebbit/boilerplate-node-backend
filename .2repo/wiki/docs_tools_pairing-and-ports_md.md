# docs/tools/pairing-and-ports.md

## Purpose

Defines the operational contract between this API backend and its paired frontend: which host ports each stack owns, which env vars must agree across the two `.env` files, and the shared-file identity mechanism (`check:spec-identity` / `sync:frontend`) that prevents silent divergence of the API and async contracts.

## Key elements

- **Port-block split** — API stack owns `3000–3099` (+ well-known infra ports); frontend owns `8080–8099`. No shared compose network exists; the host browser is the only cross-boundary entity.
- **Pairing env-var table** — documents the required one-to-one matches (`NODE_PORT` ↔ `VITE_API_URL`, `ALLOY_FARO_PORT` ↔ `VITE_FARO_URL`, `UMAMI_PORT`/`UMAMI_WEBSITE_ID` ↔ `VITE_UMAMI_*`, etc.).
- **Host port map** — every service in this repo with its host port and the env var that overrides it (API `3000`, Grafana `3001`, Umami `3080`, Docs `3090`, Loki `3100`, OTel `4318`/`4317`, RabbitMQ `5672`/`15672`, Redis `6379`, Prometheus `9090`, Alertmanager `9093`, Alloy `12347`/`12345`, MongoDB `27017`).
- **Canonical contract ownership** — `openapi.yaml` and `asyncapi.public.yaml` are produced here and copied to the frontend via `npm run sync:frontend`. Editing the frontend copy is the failure mode the identity list exists to catch.
- **`scripts/spec-identity.ts`** — the allow-list of files that must be byte-identical in both checkouts; `npm run check:spec-identity` enforces it.
- **Wi-Fi / LAN access section** — bind to `0.0.0.0`, add the LAN origin to `NODE_CORS_ORIGIN`, warn against untrusted networks.

## Relationships

- **docs/api/regenerating.md** — linked directly from the "Keeping the pair in step" section; describes the `npm run gen:api` workflow that must run after any contract edit before `check:spec-identity` will pass.
- **docs/tools/analytics.md** — linked from the "shared-file list" section; explains why the former analytics-event catalogue entry was removed (events are now emitted from this repo's handlers, not a shared name list).
- **docs/reference/scripts.md** — documents the CLI commands referenced here (`gen:api`, `check:spec-identity`, `sync:frontend`).
- **docs/reference/tests.md** — `contract-bundles.test.ts` is cited as the guard for the excluded `contract.<tool>.*` generated files.
- **README.md / docs/getting-started.md** — point new readers to this file as the authoritative port-allocation and pairing reference.

## Notes

- **`DOCS_PORT` must never be `4173`.** That is VitePress's `preview` default, used by the frontend's e2e server on the host. A past three-way collision is the reason this port map exists.
- **Identity ≠ equivalence.** The check is byte-level; two semantically identical specs that differ in key order still fail. The doc notes this is a stop-gap until a shared package or third repo is introduced.
- **`check:spec-identity` failure after switching backends is expected.** The frontend compares against the path in its own `BACKEND_PATH`, not the last backend that ran `sync:frontend`. Re-point and re-sync before treating it as a defect.
- **Deliberately excluded from the identity list:** `public/favicon/*`, `.prettierrc`, `.dockerignore`, `.husky/*`, `.docker/nginx.docs.conf`, `docs/.vitepress/theme/*`. They match by convention; gating on them trains people to skip the check.
- **Regenerable outputs are excluded.** `src/types/asyncapi.generated.ts` (gitignored, rebuilt by postinstall) and `contract.<tool>.*` (frontend holds no copy at all) carry no independent fact.
- **Wi-Fi access is a dev-only escape hatch.** The shipped `.env` has permissive CORS and default credentials; do not expose on untrusted networks.
