---
source: src/modules/example/index.ts
sha256: 014ffcb80b42401e0f930f3664dc65b6ff005d30e06e9f7cce8f35943d67e089
generated_at: 2026-10-29T03:53:14.813890+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/index.ts

## Purpose

Public barrel for the `example` module — the sole import surface that sibling modules are allowed to use. It aggregates the module's services, domain rules, events, and email templates, and re-exports the model's *types* (not its runtime values). This file exists so that external code never reaches into the module's internal file layout.

## Key elements

- **`export * from './services'`** — re-exports the example service (and any other service exports from `./services/index.ts`).
- **`export * from './domain'`** — re-exports the module's domain rules (from `./domain/index.ts`).
- **`export * from './events'`** — re-exports the publish event and any other domain events.
- **`export * from './emails'`** — re-exports email template definitions/helpers.
- **`export type * from './model'`** — re-exports *only the type-level* exports of the model (interfaces, types, literals). No runtime values are exposed.

## Relationships

- **`./services/index.ts`**, **`./domain/index.ts`**, **`./events.ts`**, **`./emails.ts`**, **`./model.ts`** — direct re-export sources; this barrel is their sole outward-facing alias.
- **`tests/cross-cutting/webhook-event-producers.test.ts`** — imports events from this barrel to verify webhook emission.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — imports email templates from this barrel for adapter unit tests.

## Notes

- `./model` is exported with `export type *`, so no runtime binding (class instances, functions, constants) from the model leaks through this surface. Importing a *value* from the model will fail at compile time via this barrel.
- Per the module convention (see `docs/theory/strategic-ddd.md`), this barrel must **never** re-export repositories, the model's runtime exports, wiring files, or `factories.ts`.
- Sibling modules must import *only* from this file; deep imports into `./services`, `./domain`, etc. are considered a violation of the module boundary.
