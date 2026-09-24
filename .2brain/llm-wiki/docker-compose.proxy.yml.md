---
source: docker-compose.proxy.yml
sha256: 0080a5e31708ef4cd888a66531aa8080386150f63f6c51035959c71b3cf59a8e
generated_at: 2026-09-23T17:11:49.667093+00:00
model: ollama:qwen3.8:27b
---

# docker-compose.proxy.yml

## Purpose

A Traefik overlay that is layered onto `docker-compose.production.yml` via a second `-f` flag. It provides shared, label-driven reverse-proxy routing (with automatic Let's Encrypt) for multiple client stacks on a single host, without altering the base stack's data topology.

## Key elements

- **`traefik` service** — One Traefik v3 instance per host. Reads routing from container labels on the shared `proxy` network, exposes `:80`/`:443`, and obtains TLS certs via ACME HTTP-01 challenge. `exposedByDefault=false` ensures only opt-in containers are routed.
- **`app` service override** — Adds `proxy` alongside `default` in the `networks` list (Compose replaces rather than merges), resets `ports` to `[]` to free the loopback port for the shared proxy, and attaches all Traefik router/service labels keyed by `${COMPOSE_PROJECT_NAME}`.
- **`networks: default: {}`** — Explicitly names the implicit default network so `app` can reference both `default` and `proxy` by name (workaround for podman-compose 1.6 rejecting undeclared network names).
- **`networks: proxy (external)`** — References a pre-created shared Docker network that Traefik watches.
- **`volumes: traefik-acme`** — Persists ACME account/key material across Traefik restarts.

## Relationships

- **`docker-compose.production.yml`** — The base file this overlay is layered onto. It defines the `app`, `database`, `cache`, `queue` services and the implicit `default` network. This overlay adds the `traefik` service, modifies `app`'s networking/ports/labels, and declares the top-level `networks` and `volumes` blocks. No other files are referenced.

## Notes

- The shared `proxy` network must be created **before** the first deploy: `docker network create proxy`. It lives outside any single client's project.
- Labels use lowercase-dotted keys (`tls.certresolver`, not `tls.certResolver`). The camelCase form appears in Traefik's static-config YAML and is a common copy-paste mistake; it will be silently ignored by the Docker provider.
- `ports: !reset []` is critical: without it, multiple clients sharing the same `NODE_PORT` will collide on the host's `127.0.0.1` interface.
- A single-stack deployment behind a standalone nginx/Caddy/managed LB does **not** need this overlay; the base file's loopback publish is sufficient.
- Traefik's Docker provider auto-detects new containers on the `proxy` network; adding client #11 requires no `traefik` restart or central route edit.
