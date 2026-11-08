---
source: docker/observability/prometheus.traefik-scrape.yaml
sha256: 775407ccb02dce3597113698db0bda0cd7b0aee1529ca931f691c48fd628f29d
generated_at: 2026-11-08T02:23:49.407337+00:00
model: ollama:qwen3.8:27b
---

# docker/observability/prometheus.traefik.scrape.yaml

## Purpose

A standalone Prometheus scrape-configuration fragment that tells a client stack's Prometheus instance where to find the shared Traefik proxy's metrics endpoint. It exists as a separate file so that only stacks layered with `docker-compose.proxy.yml` (the overlay that actually runs Traefik) pull in this job; without that overlay, no Traefik exists and the scrape config is simply not mounted.

## Key elements

- **`scrape_configs`** – a top-level list containing exactly one job.
- **`job_name: traefik`** – the Prometheus job label; queries will appear as `traefik` in dashboards and alerts.
- **`static_configs` → `targets: ['traefik:8080']`** – the scrape target, resolved via Docker's built-in DNS on the shared `proxy` network. `8080` is Traefik's internal metrics port.

## Relationships

- **docker-compose.proxy.yml** – defines the `traefik` service on the shared `proxy` network. This scrape file is only meaningful when that overlay is active; it is the overlay that mounts this file next to the Prometheus config.
- **docker/observability/prometheus.production.config.yaml** – references this file in its `scrape_config_files` list. Without that reference this file is inert; Prometheus never reads it.

## Notes

- This is a **fragment**, not a full Prometheus configuration. It must be loaded via `scrape_config_files` (or an equivalent include mechanism) to take effect.
- The target `traefik:8080` relies on Docker's service-name DNS resolution. If the client stack and the proxy overlay are not attached to the same `proxy` network, the target will be unresolvable and Prometheus will mark the scrape as `down`.
- The file intentionally has no `metrics_path`, `scheme`, or interval overrides; it inherits Prometheus defaults (`/metrics`, `http`, 15 s).
