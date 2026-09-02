# Repository Overview

## What This Repository Is

A **TypeScript e-commerce application** with a multi-tenant, multi-locale architecture. It handles users/accounts, orders, cart, product inventory, and stock management. The codebase integrates with **Stripe** (payments), **Cloudflare** (CDN/imaging), and **Vercel** (hosting/edge). It ships with a **demo mode**, **social login**, a **feature-flag (boolean gates) system**, and an **image pipeline**.

The project is contract-first: API specifications are maintained in **AsyncAPI**, **Zod schemas**, and exported to **Bruno / Insomnia / Mockoon / Postman** collections at the repository root.

## Main Areas & Relationships

| Area | Path | Role |
|---|---|---|
| **Infrastructure (cross-cutting)** | `src/infrastructure/` | HTTP layer (request, response, controller), i18n/locale context, adapters (logger). These files are the most heavily imported in the codebase (50–121 dependents). |
| **Domain modules** | `src/modules/` | Business logic per entity: `users`, `orders`, and (inferred from migrations) products, cart, inventory. Each module typically exposes a `service` and an `index` barrel. |
| **Shared types** | `src/types/` | Central type definitions imported across the codebase (~89 dependents). |
| **Database** | `db/` | Migrations (chronological, MongoDB-style collections), demo seed data, cache utilities, and a script runner. |
| **API contracts** | Root-level `*.json`, `*.yml`, `*.yaml`, `api/` | AsyncAPI specs, Zod schemas, and client-tool collections. Keep in sync via the workflow described in `docs/api/`. |
| **Documentation site** | `docs/` | VitePress site covering getting-started, per-role e-commerce guides (shopper, manager, warehouse, support), API reference, and module docs. |
| **Tests** | `tests/` | Test setup (shared DB fixture) and suites. A dedicated audit doc tracks correlated blind spots. |
| **Ops / Deployment** | `docker-compose*.yml`, `EXTERNAL_SERVICE_*.md` | Local and production Docker stacks; planning docs for each external service. |
| **Planning & feedback** | Root-level `*.md` | Changelog, feedback log, and feature-planning notes (image pipeline, social login, etc.). |

**Relationship in one line:** `src/infrastructure` provides the HTTP + i18n + logging primitives → `src/modules` uses them to implement domain logic → `db/` persists state → contracts at the root define the external API surface → `docs/` and test suites keep everything verifiable.

## Where to Start Reading

1. **`README.md`** – project purpose, quick-start, and pointer to the docs site.
2. **`docs/getting-started.md`** (and `docs/getting-started-production.md` for prod) – how to run locally.
3. **`src/infrastructure/http/`** – `request.ts`, `response.ts`, `controller.ts`: the HTTP contract every module follows.
4. **`src/infrastructure/i18n/`** – locale resolution and context; affects every user-facing response.
5. **`src/modules/users/`** and **`src/modules/orders/`** – two of the most connected modules; read their `index.ts` (barrel) then `service.ts` to see domain flow.
6. **`db/migrations/`** – read in chronological order to understand the data model evolution.
7. **`docs/demo-ecommerce/`** – role-based walkthroughs (shopper → manager → warehouse → support) that illustrate end-to-end scenarios.

## Conventions Evident in the Repo

- **Contract-first:** change an API → update AsyncAPI / Zod → regenerate client collections.
- **i18n is pervasive:** ~92 files touch the i18n index; assume every user-facing string is locale-scoped.
- **Migrations are append-only** and timestamped; do not edit historical files.
- **Demo mode** lives under `db/demo/` and is assembled separately from production data.
