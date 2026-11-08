---
source: docker-compose.proxy.yml
sha256: 93b4e0a2f90d85d5498942c7c3e85a5b9085c965fe0c3a001c72e4cedf0b2e1e
generated_at: 2026-11-08T02:17:15.189038+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.proxy.yml

## Purpose

A Traefik reverse-proxy overlay layered on `docker-compose.production.yml` (via a second `-f` flag) so that multiple client stacks on the same host share a single Traefik instance for TLS termination and routing. It adds no database, volume, or data concern to the stack it overlays—only proxy routing, certificate management, and a shared external network.

## Key elements

- **`traefik` service** — Traefik v3 (pinned by SHA) with:
  - *File provider* watching `/etc/traefik/dynamic` (hot-reloads per-client route YAML on change).
  - *ACME resolver* (Let's Encrypt, HTTP-01 challenge on the `web` entrypoint; cert storage in `traefik-acme` volume).
  - *HTTP→HTTPS redirect* on port 80 (ACME challenge exempted).
  - *Prometheus metrics* enabled on internal `:8080` (never host-published); exposes `traefik_tls_certs_not_after` for cert-expiry alerting.
- **`app` service override** — Joins both `default` (stack's own network) and `proxy` (shared); sets a per-project DNS alias (`${COMPOSE_PROJECT_NAME}-app`) to prevent cross-client round-robin; **resets `ports` to `[]`** (removes the base file's loopback publish); defaults `NODE_TRUST_PROXY_HOPS` to `1` so `request.ip` reflects the real client after one proxy hop.
- **`prometheus` service override** — Adds `proxy` network access and mounts the Traefik scrape job file so the client's own Prometheus can scrape Traefik on the shared network.
- **`networks`** — Declares `default: {}` (explicit, to work around a podman-compose bug) and `proxy` as `external: true` (pre-created on the host).
- **`volumes`** — `traefik-acme` (named volume for Let's Encrypt state).

## Relationships

- **`docker-compose.production.yml`** — The base file this overlay layers onto. The overlay overrides `app` (ports, networks, one env var) and `prometheus` (networks, one volume). The base file is unchanged and remains usable standalone.
- **`traefik/dynamic/`** — Directory mounted read-only into Traefik's file provider. Holds one small route YAML per client (copied from `traefik/client.example.yml`). Traefik watches it; adding a file is a hot reload, no restart.
- **`traefik/client.example.yml`** — Template for the per-client route file that lives in `traefik/dynamic/`.
- **`docker/observability/prometheus.traefik-scrape.yaml`** — Scrape-job definition mounted into the `prometheus` service at `/etc/prometheus/scrape.d/traefik.yml`, giving each client's Prometheus a Traefik target.

## Notes

- **Compose `networks:` replaces, not merges, across overlay files.** Omitting `default: {}` on `app`/`prometheus` silently disconnects them from the stack's own database/cache network. Always list both.
- **`proxy` network is external** and must be created once on the host (`docker network create proxy`) before the first deploy. It outlives any single client project.
- **The Docker socket is deliberately not mounted.** Traefik's file provider replaces the Docker provider to avoid a privileged container that could read every client's environment variables via the socket API (OWASP Docker Security Cheat Sheet, rule 1).
- **`traefik/dynamic/` is the only mounted route path.** The `clients/` directory (which holds secrets) is never exposed to Traefik.
- **`ports: !reset []`** is a YAML tag specific to Compose; it removes the base file's port mapping entirely rather than appending to it.
- The `default: {}` top-level network declaration exists solely to work around podman-compose 1.6 rejecting an undeclared `default` reference; on standard Docker Compose it is a no-op.
