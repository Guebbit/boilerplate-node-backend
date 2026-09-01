# Repository Overview

## What This Is

A TypeScript e-commerce backend API with a contract-first approach. It manages users, accounts/sessions, cart, checkout, orders, inventory (with reservations), delivery, feedback, and audit logging. Data is stored in MongoDB (evidenced by collection-based migrations). The API supports multi-tenant localization (locale collections, base language, tenant scoping) and image pipeline processing.

## Main Areas

| Area | Purpose |
|------|---------|
| `src/infrastructure/http/` | Request/response handling, controller base class (hub connecting to ~110 files) |
| `src/infrastructure/i18n/` | Internationalization context and resolution (~86 file connections) |
| `src/infrastructure/adapters/` | Logger and external-service adapters |
| `src/modules/` | Domain logic: orders, users, cart, inventory, delivery, feedback, account, audit-logs, inventory-reservations |
| `src/types/` | Shared TypeScript type definitions |
| `api/schemas.zod.ts` | Zod schema definitions used for request/response validation |
| `db/migrations/` | Sequential MongoDB collection/index migrations |
| `db/demo/` | Seed/demo data assembly |
| `docs/` | VitePress-powered developer documentation |
| Contract files (root) | OpenAPI, AsyncAPI, Bruno, Insomnia, Mockoon, and Postman artifacts for API testing and mocking |
| `docker-compose.yml` / `.production.yml` | Local and production service orchestration |
| `tests/support/` | Test DB setup and shared test helpers |

## How the Pieces Relate

```
Contracts (api/, *.yml, *.json)
        │
        ▼
Infrastructure (HTTP layer, i18n, logger)
        │
        ▼
Modules (orders, users, cart, inventory, …)
        │
        ▼
Data (MongoDB collections, migrations, cache)
```

Each module exposes a service layer; the HTTP controller in `infrastructure` dispatches to those services. Contracts at the repo root define the external API surface independently of runtime code. The `docs/` site mirrors the module structure for human readers.

## Where to Start

1. **`CLAUDE.md`** – project conventions and AI-assistant guidance.
2. **`README.md`** – quick-start and high-level context.
3. **`docs/getting-started.md`** – how to run locally (Docker, migrations, demo data).
4. **`docs/modules/index.md`** – one-page summary of each domain module and its responsibilities.
5. **`src/modules/orders/service.ts`** – a representative module service to see the typical request→service→DB flow.

## Notable Planning / Process Docs

- `CONTRACT_PLAN_POLYMORPHISM.md` – approach to polymorphic response schemas.
- `IMAGE_PIPELINE_PLAN.md` – image processing pipeline design.
- `INFRASTRUCTURE_LAYOUT_PLAN.md` – rationale for the `src/infrastructure/` split.
- `REINVENTING_THE_WHEEL.md` / `LODASH.md` – team decisions on library usage.

These are design discussions, not runtime code.
