---
generated_at: 2026-09-27T16:14:59.955194+00:00
model: ollama:qwen3.8:27b
---

# Repository Overview

A Node.js / TypeScript backend for a **multi-tenant shop and account platform**. It exposes a REST API (`openapi.yaml`) and an event-driven interface (`asyncapi.yaml`), persists state in MongoDB (replica-set), and ships with a full observability stack (Prometheus, Grafana, Loki, Tempo, Alertmanager).

## Main Areas & How They Relate

| Area | Path | Role |
|---|---|---|
| **Domain modules** | `src/modules/` (e.g. `users/`) | Business logic per bounded context; each module has a `service.ts`, tests, and factories. Organized with Strategic DDD (see `docs/theory/strategic-ddd.md`). |
| **Infrastructure** | `src/infrastructure/` | Cross-cutting plumbing: HTTP controller/request/response, i18n, logger adapter. Consumed by every module. |
| **Core types** | `src/types/` | Shared type definitions (`index.ts` is imported by ~248 files — the vocabulary backbone). |
| **Scenarios / E2E** | `scenarios/` | Seed data, product/account/shop fixtures, and flow scripts (backdate, loopback, shop-history, rate-limits). Backed by ephemeral MongoDB instances. |
| **API contracts** | `openapi.yaml`, `asyncapi.yaml` (+ `.public.yaml` variants) | Single source of truth for the external surface. TypeScript clients are generated via **Orval** (`orval.config.ts`). |
| **Testing** | `tests/`, `jest.config.*.js` | Unit, integration (`setup-test-db.ts`), cluster, and mutation suites. |
| **DevOps / Observability** | `docker/`, `docker-compose.*.yml` | Local, test, proxy, and production compose stacks; MongoDB init scripts; supercronic for cron; full monitoring dashboards & alert rules. |
| **Documentation** | `docs/` (VitePress) | DDD strategy, webhooks module guide, contract-fragmentation policy, mutation-testing tooling, test reference. |
| **Tooling** | `eslint.config.ts`, `orval.config.ts`, `package.json` | Linting, codegen, dependency management. |

**Relationship in one sentence:** Scenarios drive HTTP requests through the infrastructure layer; modules implement domain rules against MongoDB; contracts in YAML describe the resulting public surface; Docker + observability configs run and monitor the whole thing.

## Where to Start Reading

1. **`README.md` / `CLAUDE.md`** – project intent, quick-start, and contributor notes.
2. **`openapi.yaml` → `asyncapi.yaml`** – understand what the service actually exposes.
3. **`src/types/index.ts`** – the shared vocabulary everything depends on.
4. **`src/infrastructure/http/controller.ts`** – how a request enters the system.
5. **`src/modules/users/service.ts`** – a concrete example of module structure (service → tests → factories).
6. **`docs/theory/strategic-ddd.md`** – the architectural rationale behind the layout.
7. **`scenarios/seed.ts` → `scenarios/index.ts`** – how to bootstrap and drive an end-to-end flow locally.

> **Tip for AI readers:** the dependency-graph "hub" files (`src/types/index.ts`, `src/infrastructure/http/response.ts`, `src/infrastructure/i18n/index.ts`) are the safest anchors when tracing cross-cutting changes.
