---
source: src/modules/stock-alerts/module.ts
sha256: 5c48fd96b9855c30a900c5418eedc0e8c7e06b102178b757e472c6d45d37d349
generated_at: 2026-11-08T08:28:44.361475+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/module.ts

## Purpose

Declares the **stock-alerts** module's registration manifest: how it mounts its HTTP routes, subscribes to domain events, declares its personal-data obligations (GDPR collect/erase), and points to its job definitions, locale files, and email templates. It exists so the kernel's registry can wire this module into the application without the kernel needing to know module internals.

## Key elements

- **`default export`** – An object typed `satisfies AppModule` that is the single contract the registry reads.
  - `name` – `'stock-alerts'` (used in logging, routing namespace).
  - `mounts` – Binds the local `router` under `/stock-alerts`.
  - `jobs` – Re-exports `stockAlertsJobs` (defined in `./jobs`) so the scheduler can discover them.
  - `personalData` – Array with one entry (`section: 'stockAlerts'`) providing `collect` (export a user's alert rows) and `erase` (hard-delete within the caller's transaction).
  - `subscribe()` – Registers `onDomainEvent` handlers for `PRODUCT_BUYABLE_AGAIN` and `PRODUCT_DELETED`.
  - `locales` / `templates` – Filesystem paths relative to this directory, resolved with `path.join(__dirname, …)`.

## Relationships

- **`src/kernel/registry.ts`** – Imports the `AppModule` type; the default export must satisfy it.
- **`src/kernel/events.ts`** – Imports `onDomainEvent`; the `subscribe()` callback uses it to listen for product lifecycle events.
- **`src/modules/products/index.ts`** – Imports `PRODUCT_BUYABLE_AGAIN` and `PRODUCT_DELETED` event constants. Direction is one-way: this module *subscribes* to products' events; products never imports stock-alerts.
- **`src/modules/stock-alerts/service.ts`** – Provides `stockAlertService` used inside `personalData` handlers and event callbacks.
- **`src/modules/stock-alerts/jobs.ts`** – Provides `stockAlertsJobs` for the `jobs` field.
- **`src/modules/stock-alerts/routes.ts`** – Provides `router` for the `mounts` field.
- **`src/modules.ts`** – Aggregates this module's default export for global application assembly.
- **`tests/integration/erasure.test.ts`** – Exercises the `personalData[0].erase` path end-to-end.

## Notes

- `personalData[0].erase` joins the caller's hard-delete transaction (`session` is passed in); it does **not** open its own transaction.
- The module deliberately reaches `products` only through domain events (the doc-comment states "this module reaches `products` and not the other way round"), keeping the dependency graph acyclic.
- `locales` and `templates` are resolved at import time with `__dirname`; they assume the build output preserves the directory structure relative to this file.
