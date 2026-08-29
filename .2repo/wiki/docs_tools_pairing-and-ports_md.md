# docs/tools/pairing-and-ports.md

## Purpose

Documents the port-allocation contract between this API stack (owns `3000–3099` + well-known infra ports) and its paired frontend stack (owns `8080–8099`), the env-var pairings that must agree, the byte-identity gate for shared spec files, and how to expose the stack to other devices on a LAN.

## Key elements

- **Port-block rule** — API: `3000–3099` (new services must land here); Frontend: `8080–8099`. No overlap, no shared compose network.
- **Integration contract table** — Maps this repo's env vars (`NODE_PORT`, `ALLOY_FARO_PORT`, `UMAMI_PORT`, etc.) to the frontend's corresponding `VITE_*` vars. Shipped defaults already match; the table is for port moves.
- **Host port map** — Full table of every containerised service (API, Grafana, Umami, Docs, Loki, OTel, RabbitMQ, Redis, Prometheus, Alertmanager, Alloy, MongoDB) with its host port and overriding env var.
- **`DOCS_PORT` danger** — Must never be set to `4173` (VitePress `preview` default used by the frontend's e2e server).
- **Shared-file identity list** (`scripts/spec-identity.ts`) — Three files that must be byte-identical in both repos: `openapi.yaml`, `asyncapi.public.yaml` → `asyncapi.yaml`, and the analytics-events frontend constant. Rule: *produced here, copied there*; `npm run sync:frontend` resolves forks unidirectionally.
- **Exclusion rationale** — Regenerable outputs (`asyncapi.generated.ts`, `contract.<tool>.*`) and convenience files (favicons, `.prettierrc`, linter configs) are deliberately off the list.
- **LAN access recipe** — Bind to `0.0.0.0`, add the LAN origin to `NODE_CORS_ORIGIN`, and confirm the host firewall allows the port.

## Relationships

- **`docs/tools/package-scripts.md`** — The scripts named here (`npm run gen:api`, `npm run check:spec-identity`, `npm run sync:frontend`, `npm run check:asyncapi-types`) are defined and documented there.
- **`docs/tools/prometheus.md`** — Prometheus appears in the host port map at `9090` (`PROMETHEUS_PORT`); the operational details live in that page.

## Notes

- The two stacks are **independent compose projects** with **no shared network**. The only cross-boundary communication is the browser resolving `VITE_API_URL` to a host port. Never address the API via a compose service name from the frontend.
- **Start this (API) stack first**; the frontend's browser code posts to Alloy Faro and Umami, both owned here.
- The identity gate checks **byte-identity, not semantic equivalence**. Two specs that mean the same thing but differ in key order will still fail the check — by design, to prevent silent drift on the next regeneration.
- Every port in the map is overridable via its env var; the shipped `.env` is a development config (permissive CORS, default credentials) and must not be exposed on untrusted networks.
