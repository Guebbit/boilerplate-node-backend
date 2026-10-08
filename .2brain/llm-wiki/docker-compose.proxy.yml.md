---
source: docker-compose.proxy.yml
sha256: edb0d06f25ab557c90689c0bed5a86abc9dd3885e470fec66579777cd2fe93e2
generated_at: 2026-10-07T23:46:35.711500+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.proxy.yml

## Purpose

A Compose overlay that places a shared Traefik reverse proxy in front of a client stack, allowing many independent client deployments on one host to share a single proxy instance. It is purely routing: it defines no database, no data volume, and no seeding — only an external-facing entrypoint and a per-client route. It is applied as a second `-f` file on top of `docker-compose.production.yml`.

## Key elements

- **`services.traefik`** — Traefik v3 (pinned by SHA-256 digest). Uses the **file provider** (`--providers.file.directory=/etc/traefik/dynamic`, `watch=true`) so routes hot-reload without restart. Listens on `:80` (redirect-only, HTTP→HTTPS) and `:443`. ACME certificates via HTTP challenge, stored in the `traefik-acme` named volume. Requires `NODE_PROXY_ACME_EMAIL` from the client's `.env`.
- **`services.app` (override)** — Puts `app` on two networks simultaneously: the project's implicit `default` (reaches `database`/`cache`/`queue`) and the shared external `proxy` network. Assigns a per-client alias `${COMPOSE_PROJECT_NAME}-app` on `proxy` so Traefik routes to the correct instance. Resets `ports` to `[]` (YAML `!reset`) to avoid loopback collisions between clients sharing the same `NODE_PORT`. Sets `NODE_TRUST_PROXY_HOPS` to `1` (overridable) so the app trusts exactly one reverse-proxy hop for `request.ip`.
- **`networks`** — Declares `default: {}` explicitly (needed because the base file omits a top-level `networks:` block; podman-compose 1.6 fails without it) and `proxy` as an **external** network that must be pre-created with `docker network create proxy`.
- **`volumes.traefik-acme`** — Named volume holding `acme.json` for Let's Encrypt state.

## Relationships

- **`docker-compose.production.yml`** — The base file this overlay layers onto. The overlay overrides `app`'s `networks`, `ports`, and `environment`. The base file is left untouched for single-stack deployments that use a standalone nginx, Caddy, or managed LB instead; no overlay is needed in that case.

## Notes

- **Pre-deploy steps (once per host):** `docker network create proxy`, then for each client add `NODE_PROXY_ACME_EMAIL` to its `.env` and drop a route file into `traefik/dynamic/`. Traefik reloads routes automatically.
- **Traefik is started once per host**, not per client. Whichever client's `docker compose up` runs first starts the container; later `up`s with different `COMPOSE_PROJECT_NAME` values simply join the shared `proxy` network.
- **File provider over Docker socket (deliberate):** Mounting `/var/run/docker.sock` (even `:ro`) exposes the full Docker API, including `Config.Env` of every container. The file provider reads only the small route files in `traefik/dynamic/`, which contain no secrets. See OWASP Docker Security Cheat Sheet, rule 1.
- **Never mount `clients/`** into the Traefik container — that directory holds every client's secrets.
- **`ports: !reset []`** is essential: without it, every client publishing to the same host port on loopback would collide.
- **`default: {}`** in `networks` is a no-op declaration that satisfies podman-compose 1.6's requirement to see a named `default` network; omitting it causes a "missing networks: default" error.
- The per-client alias on `proxy` prevents DNS round-robin across clients: a bare `app` name would resolve to *all* clients' `app` containers on the shared network.
