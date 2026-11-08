---
generated_at: 2026-11-08T10:45:45.183171+00:00
model: ollama:qwen3.8:27b
---

# Repository Overview

## What This Is

A TypeScript/Node.js API application with a modular domain structure (users, products), a MongoDB data layer, and a comprehensive Docker-based deployment pipeline. It ships with an observability stack (Prometheus, Grafana, Loki, Tempo, OpenTelemetry, Alertmanager, Gatus), backup/restore tooling, and a VitePress documentation site. Multiple `docker-compose` files define dev, test, production, proxy (Traefik), and backup-server topologies.

## Main Areas

| Area | Path | Role |
|---|---|---|
| **Domain modules** | `src/modules/` | Business logic per aggregate (users, products, …). Each module contains tests and factories. |
| **Infrastructure** | `src/infrastructure/` | Cross-cutting HTTP controller/response layer, structured logger, i18n. |
| **Shared types** | `src/types/` | Central type definitions; the single most-connected file in the graph (≈ 630 dependents). |
| **Container & ops** | `docker/` | Dockerfiles, entrypoints, cron jobs, backup scripts, and all observability configs. |
| **Tests** | `tests/` | Shared test harness: DB setup, environment helpers, caller fakes, per-module factories. |
| **Docs site** | `docs/` | VitePress site covering getting-started, API reference, theory (auth, data protection), and ops tooling. |
| **Top-level config** | repo root | `docker-compose*.yml` (5 variants), lint config, security and install notes. |

### How they relate

`src/types` is the common vocabulary consumed by every module and the HTTP layer. `src/infrastructure` wraps module logic in a uniform controller/response/serialization shell. `docker/` packages the built server together with MongoDB, a reverse proxy, and the observability stack into reproducible topologies. `tests/` mirrors the `src/modules` structure and exercises the same types and infrastructure. `docs/` is generated from the same source tree and documents the contracts those layers expose.

## Where to Start Reading

1. **`README.md`** / **`CLAUDE.md`** – project intent, conventions, and setup at a glance.
2. **`docs/getting-started.md`** (then `getting-started-production.md`) – how to run and deploy.
3. **`src/types/index.ts`** – the shared type surface; understanding it makes every module readable.
4. **`src/infrastructure/http/controller.ts`** and **`response.ts`** – how module handlers are mounted and how responses are shaped.
5. **`docker-compose.yml`** + **`docker/Dockerfile`** – the dev topology and container build.
6. **`src/modules/users/`** (or `products/`) – a concrete module to trace the full request → handler → data flow.

> All 2 500+ files in the graph are reachable from the nodes above; treat this list as the skeleton and drill into a single module when you need detail.
