# Repository Overview

## What This Is

A TypeScript backend service for a multi-tenant e-commerce platform. It exposes both a REST API (Zod-validated request/response schemas) and an async/event-driven interface (AsyncAPI specs, internal and public). Core domain modules cover products, cart, checkout, orders, inventory reservations, payments, delivery, user accounts/sessions, locales (i18n), audit logs, feedback, and observability.

## Architecture at a Glance

| Layer | Location | Role |
|---|---|---|
| **Infrastructure** | `src/infrastructure/` | Cross-cutting concerns: HTTP transport (`controller`, `request`, `response`), internationalization (`i18n/`), adapters (e.g. `logger`) |
| **Domain modules** | `src/modules/` | Business logic per bounded context: `orders`, `users`, `products`, `cart`, `inventory`, `payments`, `locales`, `delivery`, `account`, `feedback`, etc. |
| **Shared types** | `src/types/` | Core type definitions consumed across nearly every module |
| **Database** | `db/` | Schema migrations (timestamped JS), demo/seed data, operational scripts (`run-script.ts`, `cache-clear.ts`) |
| **API contracts** | Root level | `asyncapi.yaml` / `asyncapi.public.yaml`, `api/schemas.zod.ts`, plus exported collections for Bruno, Postman, Insomnia, and Mockoon |
| **Docs** | `docs/` | VitePress site: getting-started, per-module pages, API workflow guides, contract-fragmentation notes |
| **Tests** | `tests/` | Integration tests with a shared DB setup helper |
| **Deployment** | Root | `docker-compose.yml` (dev) and `docker-compose.production.yml` |

### How the pieces relate

1. **Types** (`src/types/index.ts`) are the shared vocabulary every module and infrastructure file imports.
2. **Infrastructure** provides the HTTP plumbing and i18n context that each module's controllers and services depend on.
3. **Modules** implement domain logic and talk to the database layer; they emit/consume events described in the AsyncAPI specs.
4. **Migrations** evolve the database schema in lockstep with module changes.
5. **Contract files** are generated or maintained alongside the code and consumed by downstream clients and mocks.

## Where to Start Reading

1. **`docs/getting-started.md`** – project conventions, local dev setup.
2. **`src/types/index.ts`** – the shared type surface (linked from ~88 files).
3. **`src/infrastructure/http/controller.ts`** – how requests are dispatched to modules.
4. **`src/infrastructure/i18n/context.ts`** – how locale/tenant context flows through requests.
5. **`src/modules/orders/service.ts`** – a representative domain service (touches 46 other files) to see how modules compose infrastructure + DB + types.
6. **`db/migrations/`** (read chronologically) – fastest way to understand the data model.
7. **`asyncapi.yaml`** – the event/endpoint surface from the outside in.
