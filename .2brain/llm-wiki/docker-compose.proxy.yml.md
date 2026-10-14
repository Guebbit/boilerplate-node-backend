---
source: docker-compose.proxy.yml
sha256: 93b4e0a2f90d85d5498942c7c3e85a5b9085c965fe0c3a001c72e4cedf0b2e1e
generated_at: 2026-10-14T06:46:28.041551+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.proxy.yml

## Purpose

A Compose overlay that adds a shared Traefik reverse proxy in front of a client stack. It is layered via a second `-f` on top of `docker-compose.production.yml` so that many client stacks on the same host share one proxy instance (one `traefik` container, one set of ACME certs) while each client keeps its own data, network, and project name. It defines routing, TLS termination, and trust-proxy configuration only — no database, volume seeding, or data-plane changes.

## Key elements

- **`traefik` service** – Single shared reverse proxy (pinned image). Configured with the **file provider** watching `/etc/traefik/dynamic/` (hot-reload on file change), entrypoints on :80 (HTTPS redirect + ACME HTTP-01) and :443, Let's Encrypt ACME resolver, and Prometheus metrics on the internal :8080 entrypoint (exposes `traefik_tls_certs_not_after` for monitoring).
- **`app` service override** – Joins both `default` and `proxy` networks (explicitly, because Compose *replaces* `networks:` across files). Assigns a project-scoped alias (`${COMPOSE_PROJECT_NAME}-app`) so Traefik routes to the correct client. Resets `ports` to `[]` to free the loopback port and avoid collisions between clients. Defaults `NODE_TRUST_PROXY_HOPS` to `1` so the app sees the real client IP via `X-Forwarded-For`.
- **`prometheus` service override** – Joins the `proxy` network and mounts a Traefik scrape job file so the client's Prometheus can monitor the shared proxy.
- **`networks`** – Declares `default: {}` (preserves the implicit network; required for podman-compose compatibility) and `proxy` as `external: true` (created once on the host via `docker network create proxy`).
- **`volumes`** – `traefik-acme` named volume for ACME storage.

## Relationships

- **`docker-compose.production.yml`** – The base (lower) file this overlay layers onto. The base defines `app`, `database`, `cache`, `queue`, and publishes the API on loopback. This overlay does not modify those services beyond the `app` override above; it adds the `traefik` service, the `prometheus` network/volume additions, the top-level `networks` and `volumes` blocks, and the trust-proxy env var. They are always used together in a single `docker compose -f … -f …` invocation.

## Notes

- **Pre-flight (one-time, host-level):** Create the shared network (`docker network create proxy`) and add `NODE_PROXY_ACME_EMAIL` to the client's `.env` before the first `up`.
- **Per-client route:** Copy `traefik/client.example.yml` → `traefik/dynamic/<COMPOSE_PROJECT_NAME>.yml` and set the `Host` rule. Traefik's file provider hot-reloads; no container restart needed.
- **Security rationale for file provider:** The Docker socket exposes `Config.Env` for every container (all client secrets). The file provider reads only route YAML, avoiding a privileged socket mount. Mount `./traefik/dynamic/` read-only; never mount `clients/`.
- **Network naming is mandatory on both services:** Omitting `default` from `app`'s or `prometheus`'s `networks:` silently removes their access to the project's internal network (Compose replaces, not merges, across files).
- **Named alias prevents cross-client round-robin:** A bare `app` name resolves on the shared `proxy` network to *every* client's `app` container; the `${COMPOSE_PROJECT_NAME}-app` alias scopes DNS to the correct one.
- **`ports: !reset []`** is intentional: once Traefik fronts the stack the loopback publish is dead weight and would collide across clients sharing the same `NODE_PORT`.
- **`default: {}` at top level** is a podman-compose 1.6 workaround; plain Docker Compose would accept the implicit network, but referencing it by name fails without the explicit declaration.
