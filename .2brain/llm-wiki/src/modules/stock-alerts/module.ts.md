---
source: src/modules/stock-alerts/module.ts
sha256: 5c48fd96b9855c30a900c5418eedc0e8c7e06b102178b757e472c6d45d37d349
generated_at: 2026-10-29T05:58:50.103578+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/module.ts

## Purpose

Module manifest for the **stock-alerts** feature. It wires the module's routes, background jobs, domain-event subscriptions, and personal-data (export/erase) hooks into the application kernel so a signed-in buyer can request a one-time notification when an un-orderable product becomes available again. The file itself contains no business logic; it is purely declarative registration.

## Key elements

- **Default export** – An object `satisfies AppModule` (from `@kernel/registry`) that the kernel consumes. Fields:
  - `name` – `'stock-alerts'`, the module's identity key.
  - `mounts` – Mounts the local `router` at `/stock-alerts`.
  - `jobs` – Passes through `stockAlertsJobs` from `./jobs`.
  - `personalData` – A single `stockAlerts` section with `collect` (export via `stockAlertService.exportRows`) and `erase` (hard-delete via `stockAlertService.removeByUserId`, which participates in the caller's transaction).
  - `subscribe` – Registers two `onDomainEvent` handlers (from `@kernel/events`): `PRODUCT_BUYABLE_AGAIN` → `stockAlertService.onBuyableAgain(productId)`; `PRODUCT_DELETED` → `stockAlertService.removeByProductId(productId)`.
  - `locales` / `templates` – Filesystem paths (relative to this directory) for i18n strings and view templates.

## Relationships

- **`src/kernel/registry.ts`** – Provides the `AppModule` type that constrains the default export.
- **`src/kernel/events.ts`** – Provides `onDomainEvent`, the subscription API used inside `subscribe()`.
- **`src/modules/products/index.ts`** – Source of the `PRODUCT_BUYABLE_AGAIN` and `PRODUCT_DELETED` event constants; this module *listens* to products, never the reverse.
- **`src/modules/stock-alerts/service.ts`** – All runtime logic (export, erase, event reactions) delegates to `stockAlertService`.
- **`src/modules/stock-alerts/jobs.ts`** – Supplies the scheduled/background job definitions exposed as `jobs`.
- **`src/modules/stock-alerts/routes.ts`** – Supplies the HTTP `router` mounted at `/stock-alerts`.
- **`src/modules.ts`** – Aggregates this module's manifest into the application-wide module list.
- **`tests/integration/erasure.test.ts`** – Exercises the `personalData.erase` hook end-to-end.

## Notes

- The `erase` callback intentionally receives the caller's `session` (transaction) so the hard-delete joins the same transaction as the rest of the account-erasure flow. Do not start a separate transaction here.
- Event direction is strictly **products → stock-alerts**: this module subscribes to product events; it never emits one back. Keep it that way.
- `satisfies AppModule` (not a type annotation) is used deliberately so the object literal keeps its concrete inferred shape while still being structurally checked against the kernel contract.
