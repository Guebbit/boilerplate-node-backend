---
generated_at: 2026-10-15T13:33:53.309991+00:00
model: ollama:qwen3.8:27b
---

# Repository Overview

## What This Is

A Node.js / TypeScript backend application with a REST API (OpenAPI) and an event/webhook layer (AsyncAPI). It manages users, accounts, addresses, and application/flow workflows. The codebase follows a modular, DDD-influenced structure (see `docs/theory/strategic-ddd.md`) and ships with a full Docker Compose stack including MongoDB (replica set), a proxy, and a complete observability suite.

## Main Areas

| Area | Where | Notes |
|---|---|---|
| **Domain modules** | `src/modules/` | Bounded contexts (e.g. `users`). Each owns its entities, services, and tests. |
| **Infrastructure** | `src/infrastructure/` | Cross-cutting: HTTP controllers/responses, logging, i18n, adapters. |
| **Shared types** | `src/types/` | Central type definitions consumed by ~465 files (auth context, domain types, etc.). |
| **API contracts** | `openapi.yaml`, `asyncapi.yaml` / `asyncapi.public.yaml` | REST + event schemas. Client code generated via `orval.config.ts`. |
| **Web / docs site** | `docs/` (VitePress) | Internal developer docs: API contract guides, webhooks module, DDD theory, test references. |
| **Scenarios (load/E2E)** | `scenarios/` | Scripted flows for accounts, addresses, apply, and action sequences. |
| **Docker & ops** | `docker/`, `docker-compose*.yml` | App, proxy, test, and production compose stacks; MongoDB init; backup/restore/drill scripts; observability (Prometheus, Grafana, Loki, Tempo, OTel, Alertmanager, Umami). |
| **Testing** | `tests/`, `jest.config.*.js` | Unit/integration (Jest), mutation testing, broker- and cluster-scoped suites. |
| **Security** | `SECURITY.md` | Vulnerability reporting and security policies. |

## How the Pieces Relate

```
scenarios / tests
        │
        ▼
  src/modules/*  (domain logic, factories, services)
        │
        ▼
  src/infrastructure/*  (HTTP layer, logger, i18n, adapters)
        │
        ▼
  src/types/*  (shared types, auth context)
        │
        ▼
  openapi.yaml / asyncapi.yaml  (external contracts)
        │
        ▼
  docker/  (containers, DB, observability, backup)
```

The type layer and infrastructure adapters sit at the top of the dependency graph, confirming they are the shared foundation every module builds on.

## Where to Start Reading

1. **`README.md`** – project purpose, quick-start, and link map.
2. **`CLAUDE.md`** – conventions and context for AI-assisted work.
3. **`docs/theory/strategic-ddd.md`** – the architectural vocabulary used across modules.
4. **`src/types/index.ts`** – the single largest type hub; read this before diving into any module.
5. **`src/infrastructure/http/controller.ts` → `response.ts`** – the request/response pattern every route follows.
6. **`openapi.yaml` / `asyncapi.yaml`** – the external surface of the API; useful for understanding module boundaries without reading code.
7. **`docker-compose.yml`** – the concrete list of running services and how they wire together.

> **Tip:** The `jest.config.broker.js` and `jest.config.cluster.js` files indicate the test suite is split by concern. Run the base `jest.config.js` first; consult the others when touching broker or cluster-specific logic.
