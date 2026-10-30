---
generated_at: 2026-10-29T19:18:39.394674+00:00
model: ollama:qwen3.8:27b
---

# Repository Overview

## What This Is

A TypeScript/Node.js application with a dual API surface (REST via OpenAPI, events via AsyncAPI), MongoDB persistence, and a Docker-based deployment model. It follows Domain-Driven Design (see `docs/theory/strategic-ddd.md`) and is organized around domain modules (users, products, webhooks) with a shared infrastructure layer. The presence of separate `jest.config.broker.js` and `jest.config.cluster.js` suggests a distributed topology with at least a broker and a cluster component.

## Main Areas and How They Relate

| Area | Role |
|---|---|
| `src/types/` | Shared type definitions; the most-connected file in the repo (608 imports) |
| `src/infrastructure/` | Cross-cutting concerns: HTTP response/controller, logging adapter, i18n |
| `src/modules/` | Domain logic (users, products, webhooks) with per-module test factories |
| `scenarios/` | Feature-level acceptance tests (accounts, addresses, apply, check, blank) |
| `tests/` | Unit/integration tests + shared support (test DB setup, environment, callers) |
| `docker/` | Container entrypoints, backup/restore/DR drills, and a full observability stack (Prometheus, Grafana, Loki, Tempo, OTel Collector, Alertmanager, Umami) |
| `docs/` | VitePress site: API contracts, DDD theory, webhooks, testing strategy |
| Root configs | `openapi.yaml`, `asyncapi.yaml` (external contracts), `orval.config.ts` (client generation), multiple `jest.config.*.js`, `knip.config.ts`, `eslint.config.ts` |
| `docker-compose*.yml` | Local, test, production, and proxy deployment topologies |

**Relationship:** `src/types` → `src/infrastructure` → `src/modules` forms the application core. `scenarios` and `tests` exercise that core. `docker/` packages and monitors the running system. `openapi.yaml` / `asyncapi.yaml` are the external contract; `orval` generates clients from them.

## Where to Start Reading

1. **`CLAUDE.md`** – project conventions and AI-assistant context.
2. **`README.md`** / **`INSTALL.md`** – setup and quick start.
3. **`docs/theory/strategic-ddd.md`** – architectural intent and module boundaries.
4. **`openapi.yaml`** / **`asyncapi.yaml`** – the full external API surface.
5. **`docker-compose.yml`** – how services are wired together at runtime.
6. **`src/modules/`** – pick a module (e.g. `users`) to see domain logic, its tests, and its factories.
7. **`scenarios/`** – end-to-end behaviour in human-readable steps.
8. **`docker/observability/`** – monitoring and alerting configuration (only if you need operational detail).

## Conventions Worth Noting

- Tests are split across four Jest projects (root, broker, cluster, mutation).
- API clients are generated, not hand-written (`orval.config.ts`).
- Backup and disaster-recovery drills are first-class (`docker/backup/`, `docker/deploy-drill.sh`).
- A `knip.config.ts` is present, suggesting dead-code hygiene is enforced.
