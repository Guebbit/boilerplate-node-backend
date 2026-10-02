---
generated_at: 2026-10-01T14:23:06.096301+00:00
model: ollama:qwen3.8:27b
---

# Repository Overview

## What this repository is

A TypeScript (Node.js) backend platform with a modular, domain-driven architecture. It exposes both a REST API (`openapi.yaml`, client generated via Orval) and an event/webhook surface (`asyncapi.yaml` / `asyncapi.public.yaml`). Evidence points to a multi-tenant shop/e-commerce management system: domain modules include users, shop modules, products, accounts, addresses, webhooks, rate limiting, and scheduled jobs (supercronic). Persistence is MongoDB. The project follows **Strategic Domain-Driven Design** (see `docs/theory/strategic-ddd.md`).

## Main areas and how they relate

| Area | Path / Files | Role |
|---|---|---|
| **Domain modules** | `src/modules/**` (e.g. `users`, webhooks, shop-modules, …) | Bounded contexts. Each owns its entities, services, and controllers. |
| **Infrastructure** | `src/infrastructure/{http, i18n, adapters, …}` | Cross-cutting concerns: HTTP controller/request/response pipeline, i18n context, logger, and adapters. Widely imported (100+ dependents each). |
| **Shared types** | `src/types/index.ts`, `src/types/auth-context.ts` | Central type contracts; `types/index.ts` connects to ~307 files and is the single most-connected source file. |
| **Scenarios & flows** | `scenarios/` | Local dev server, DB seeding, product/account data fillers, business-flow scripts (actions, backdate, shop-history, loopback), and rate-limit helpers. |
| **Testing** | `tests/`, `jest.config.*.js`, `docs/reference/tests.md` | Jest unit/integration suites, a cluster config, and a mutation-testing setup (`jest.config.mutation.js`, `docs/tools/mutation-testing.md`). |
| **API contracts** | `openapi.yaml`, `asyncapi.yaml`, `orval.config.ts`, `docs/api/` | Source-of-truth specs; Orval generates the typed client. |
| **Deployment & observability** | `docker-compose*.yml`, `docker/`, `docker/observability/` | Multi-service Docker stacks (app, Mongo replica-set, proxy). Full observability: OpenTelemetry Collector → Prometheus + Alertmanager (metrics), Loki + Promtail (logs), Tempo (traces), Grafana dashboards, Umami (product analytics). |
| **Docs & AI guidance** | `docs/` (VitePress site), `CLAUDE.md`, `README.md`, `SECURITY.md` | Project documentation, AI-assistant instructions, and security policy. |

**Relationship:** Domain modules depend on shared types and infrastructure layers; they never import each other directly. Scenarios orchestrate multiple modules for local runs and seeding. Contract files (`openapi`/`asyncapi`) are the external interface; Orval and the scenario scripts are the internal consumers.

## Where to start reading

1. **`README.md`** and **`CLAUDE.md`** – project purpose, commands, conventions.
2. **`docs/theory/strategic-ddd.md`** – the architectural model the codebase follows.
3. **`src/types/index.ts`** – the central type hub; understanding it unlocks most modules.
4. **`src/infrastructure/http/controller.ts`** → `request.ts` → `response.ts` – the HTTP request/response pipeline every module plugs into.
5. **`openapi.yaml`** (REST) and **`asyncapi.yaml`** (events/webhooks) – the external API surface.
6. **`scenarios/config.ts`** and **`scenarios/run-server.ts`** – how the local/dev environment is wired together.

> All claims above are inferred from the file inventory and dependency-graph summary provided; no source code was inspected.
