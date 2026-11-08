---
source: traefik/client.example.yml
sha256: 5a474beb331175343e02bed19496b3da90c42e72ae9900f496a9293d518c1c18
generated_at: 2026-11-08T10:45:16.764933+00:00
model: ollama:qwen3.8:27b
---

# traefik/client.example.yml

## Purpose

A ready-to-copy template that defines a single client's route on the shared Traefik proxy. You duplicate it into `traefik/dynamic/<COMPOSE_PROJECT_NAME>.yml`, replace the placeholder host, service name, and port, and Traefik hot-reloads the new route via `--providers.file.watch=true`—no restart, no changes to other clients. Deleting the file removes the client from the proxy.

## Key elements

- **`http.routers.acme`** — Route matched by `Host(...)` rule on the `websecure` entry point; attaches TLS via the `le` cert resolver and points to the `acme` service.
- **`http.services.acme`** — Load-balancer service targeting `http://acme-app:3000` (the `<COMPOSE_PROJECT_NAME>-app` overlay alias).
- **`healthCheck` (commented out)** — Readiness probe for `/readyz`; intentionally disabled by default because a single `app` replica has no alternative upstream and Traefik's own 503 omits CORS headers. Uncomment when running ≥ 2 replicas.

## Relationships

- **`docker-compose.proxy.yml`** — Declares the shared Traefik container, the `proxy` overlay network this file's service URL joins, and the `le` Let's Encrypt (HTTP-challenge) resolver referenced by `certResolver`.
- **`shared/contracts/openapi.root.yaml`** — The OpenAPI contract for the API that the `app` service (and thus this route) exposes; consumers discover endpoints through this contract while traffic arrives via this Traefik route.

## Notes

- The template lives **outside** `traefik/dynamic/` on purpose: that directory is the one Traefik watches, and a template left there would be loaded as a live route. Client files *inside* `traefik/dynamic/` are gitignored.
- The placeholder name `acme` appears three times (router key, service key, service URL) and must be replaced consistently in the copy.
- The service URL must use the `<COMPOSE_PROJECT_NAME>-app` alias, **not** a bare `app`. On the shared `proxy` network every client's `app` container is reachable by its own alias; a bare name would cause Traefik to balance one client's traffic across all clients' `app` containers.
- The `NODE_PORT` in the URL comes from the client's own env file, not a global setting.
