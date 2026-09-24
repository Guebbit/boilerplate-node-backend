---
generated_at: 2026-09-23T20:33:05.693255+00:00
model: ollama:qwen3.8:27b
---

# Repository Overview

## What This Is

A TypeScript/Node.js HTTP + async-messaging service with a modular domain-driven architecture (evidenced by `docs/theory/strategic-ddd.md`). It exposes a REST API (`openapi.yaml`) and publishes async events (`asyncapi.yaml`), persists to MongoDB, and ships with a full observability stack (Prometheus, Grafana, Loki, Tempo, OpenTelemetry, Alertmanager).

Key domain concepts visible across files: **users/accounts**, **addresses**, **products**, **locales (i18n)**, **shop history**, **rate limits**, **webhooks**, and a **subject** model.

## Main Areas

| Area                        | Path / Entry                                        | Role                                                                                          |
| --------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Core types**              | `src/types/index.ts`                                | Central type definitions (touches ~233 files)                                                 |
| **HTTP infrastructure**     | `src/infrastructure/http/`                          | Controller, request, response abstractions                                                    |
| **i18n / locale**           | `src/infrastructure/i18n/`                          | Locale context and internationalisation plumbing                                              |
| **Logging**                 | `src/infrastructure/adapters/logger.ts`             | Structured logging adapter                                                                    |
| **Domain modules**          | `src/modules/<name>/`                               | Bounded contexts (e.g. `users` with `service.ts`)                                             |
| **Scenarios / E2E**         | `scenarios/`                                        | Seed, flow, and integration scenarios (accounts, products, shop, backdate, rate-limits, etc.) |
| **Test infrastructure**     | `tests/support/`, `jest.config.*`                   | Unit, cluster, and mutation-test setups                                                       |
| **API contracts & codegen** | `openapi.yaml`, `asyncapi*.yaml`, `orval.config.ts` | Spec-driven client generation                                                                 |
| **Documentation site**      | `docs/` (VitePress)                                 | Architecture theory, API guides, tooling docs                                                 |
| **Docker / observability**  | `docker-compose*.yml`, `docker/observability/`      | Local, test, production, and proxy deployments; full monitoring stack                         |

### How They Relate

```
openapi.yaml / asyncapi.yaml   ← specs
        │
   orval.config.ts            ← generated clients
        │
src/infrastructure/http/       ← request/response/controller layer
        │
src/modules/<domain>/          ← business logic (service.ts, etc.)
        │
   MongoDB                     ← persistence
        │
scenarios/ + tests/            ← integration & E2E verification
```

The i18n layer and logger adapter sit alongside the HTTP infrastructure as cross-cutting concerns used by every module.

## Where to Start Reading

1. **`README.md` / `CLAUDE.md`** – project purpose and setup instructions.
2. **`openapi.yaml`** – the full REST surface; gives the fastest map of endpoints.
3. **`src/types/index.ts`** – shared vocabulary; understand the core domain types.
4. **`src/modules/users/service.ts`** – a representative domain module showing the module pattern.
5. **`docs/theory/strategic-ddd.md`** – the architectural intent behind the module boundaries.
6. **`scenarios/index.ts`** – how end-to-end scenarios are wired together; a practical tour of feature behaviour.
7. **`docs/reference/tests.md`** – how to run and extend the test suites.

## Quick Orientation Tips

- **Two API specs, two audiences:** `openapi.yaml` (REST) and `asyncapi.yaml` (events). The `.public.yaml` variants are the externally exposed contracts.
- **Multiple Docker Compose files** target different environments: `docker-compose.yml` (dev), `.test.yml`, `.production.yml`, `.proxy.yml`.
- **Mutation testing** is a first-class concern (`jest.config.mutation.js`, `docs/tools/mutation-testing.md`).
- **Contract fragmentation** (`docs/api/contract-fragmentation.md`) and **regeneration** (`docs/api/regenerating.md`) describe how API specs are split and code is regenerated via Orval.
