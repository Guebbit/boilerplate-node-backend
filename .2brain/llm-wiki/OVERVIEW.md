---
generated_at: 2026-10-07T23:52:03.159314+00:00
model: ollama:qwen3.8:27b
---

# Repository Overview

## What This Is

A TypeScript/Node.js multi-tenant platform (evidenced by shop, product, account, and application domains) built with MongoDB, Docker, and an event-driven messaging layer. It follows a Domain-Driven Design (strategic DDD) structure with explicit infrastructure and module boundaries.

## Architecture at a Glance

| Layer | Key evidence |
|---|---|
| **Domain modules** | `src/modules/*` (e.g. `users`); documented in `docs/theory/strategic-ddd.md` |
| **Infrastructure** | `src/infrastructure/http/` (controller, request, response), `src/infrastructure/i18n/`, `src/infrastructure/adapters/` |
| **Shared types** | `src/types/index.ts` (fan-out to 363 files) |
| **API contracts** | `openapi.yaml` (REST), `asyncapi.yaml` / `asyncapi.public.yaml` (events), `orval.config.ts` (client generation) |
| **Messaging / jobs** | `jest.config.broker.js`, SuperCronic installer (`docker/install-supercronic.mjs`) |
| **Observability** | Prometheus, Grafana, Loki, Tempo, OpenTelemetry, Alertmanager, Umami (all under `docker/observability/`) |
| **Deployment** | `docker-compose.yml` (dev), `docker-compose.production.yml`, `docker-compose.proxy.yml`, `docker-compose.test.yml` |

## Main Areas and How They Relate

1. **`src/modules/`** – Bounded domain modules (users, products, shops, applications, …). Each module owns its business logic and exposes use cases to the HTTP/event layers.
2. **`src/infrastructure/`** – Cross-cutting concerns: HTTP transport, i18n, logging adapters. Modules depend on these; infrastructure does not depend on modules.
3. **`src/types/`** – Shared TypeScript contracts; the single largest fan-out node in the graph.
4. **`scenarios/`** – End-to-end test fixtures and flow definitions (accounts, products, shops, backdating, rate-limits, jobs). Consumed by the Jest suite.
5. **`tests/`** – Test harness (`setup-test-db.ts`, `environment.ts`) plus mutation-testing config (`jest.config.mutation.js`).
6. **`docker/` + `docker/observability/`** – Containerised runtime (MongoDB replica set, app, scheduler) and a full monitoring stack.
7. **`docs/`** – VitePress-based documentation covering API contracts, webhooks, DDD theory, and testing tooling.
8. **Top-level specs** – `openapi.yaml`, `asyncapi.yaml`, `package.json`, `CLAUDE.md`.

## Where to Start Reading

1. **`README.md`** – Project intro and quick-start.
2. **`CLAUDE.md`** – Conventions and AI-assistant guidance (useful orientation).
3. **`package.json`** – Scripts, dependencies, and the module map.
4. **`openapi.yaml` / `asyncapi.yaml`** – The external contract; read before any source.
5. **`src/types/index.ts`** – Central type definitions that most files import.
6. **`src/infrastructure/http/controller.ts`** – The HTTP entry-point pattern.
7. **`src/modules/users/`** – A representative module to see the DDD structure in practice.
8. **`docs/theory/strategic-ddd.md`** – The architectural rationale.
9. **`scenarios/index.ts`** – How integration tests are composed.
10. **`docker-compose.yml`** – How all pieces are wired together at runtime.
