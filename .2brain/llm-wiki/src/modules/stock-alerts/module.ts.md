---
source: src/modules/stock-alerts/module.ts
sha256: fc7386ea264afb48125c6b0322a2fad49c54bc1ab7eaa4fed7bc721daa13d47f
generated_at: 2026-11-14T22:03:36.652102+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/module.ts

## Purpose

Module manifest for the stock-alerts feature: a signed-in buyer registers to receive a single notification when a product they could not order becomes buyable again. This file wires together the module's routes, config, jobs, personal-data handlers, and domain-event subscriptions into one `AppModule` object that the kernel registry discovers.

## Key elements

- **`default` export** — An object satisfying `AppModule` with `name: 'stock-alerts'`, mounted routes, config, jobs, personal-data hooks, event subscriptions, and locale/template paths.
- **`mounts`** — Registers the `router` (from `./routes`) at the base path `/stock-alerts`.
- **`config`** — Exposes `stockAlertsConfig.slice` for the kernel's config system.
- **`jobs`** — Attaches `stockAlertsJobs` (from `./jobs`) for scheduled work.
- **`personalData`** — Declares a `stockAlerts` section with `collect` (export a user's rows) and `erase` (hard-delete rows, joining the caller's transaction via the `session` argument).
- **`subscribe()`** — Registers two domain-event handlers:
  - `PRODUCT_BUYABLE_AGAIN` → calls `stockAlertService.onBuyableAgain(productId)`.
  - `PRODUCT_DELETED` → checks `productService.isLive(productId)` first; only deletes alerts if the product is genuinely gone (guards against a retried delivery arriving after a restore).
- **`locales` / `templates`** — Absolute paths to the module's `locales/` and `templates/` directories.

## Relationships

- **`src/kernel/events.ts`** — Imports `onDomainEvent` to register the two subscriptions above.
- **`src/kernel/registry.ts`** — Imports the `AppModule` type that the default export must satisfy.
- **`src/modules/products/index.ts`** — Imports `PRODUCT_BUYABLE_AGAIN`, `PRODUCT_DELETED` (event constants) and `productService` (for the `isLive` check in the deletion handler). This is the only direction of cross-module dependency; `products` has no import back into stock-alerts.
- **`src/modules/stock-alerts/service.ts`** — Imports `stockAlertService`, used in all three event/personal-data call sites.
- **`src/modules/stock-alerts/routes.ts`** — Imports `router` for the HTTP mount.
- **`src/modules/stock-alerts/jobs.ts`** — Imports `stockAlertsJobs` for the kernel job runner.
- **`src/modules/stock-alerts/config.ts`** — Imports `stockAlertsConfig` for the config slice.
- **`tests/integration/erasure.test.ts`** — Integration test exercising the account-erasure path (the `collect`/`erase` hooks declared here) end-to-end.

## Notes

- The `PRODUCT_DELETED` handler intentionally defers to `productService.isLive()` before deleting. A retried delivery can re-fire the event *after* a product is restored; in that case the buyer's alert still stands and must be preserved.
- The `erase` hook receives a `session` and joins the caller's hard-delete transaction rather than opening its own — callers (e.g. an account-erasure orchestrator) control the atomicity boundary.
- The outgoing notification mail is written by the `notifications` module reacting to an event this module emits; the code for that hand-off is not visible here.
