---
source: tests/support/routed-modules.ts
sha256: 02321ab406d5093629c3cc439a1ecd9cd943c4996bf82d2e8a7bb49654941f95
generated_at: 2026-09-23T20:13:23.499494+00:00
model: ollama:qwen3.8:27b
---

# tests/support/routed-modules.ts

## Purpose

Central registry of every Express router mounted under `src/modules/`, exposed as a single `Record<string, Router>` map for test consumption. It exists as a separate file (not folded into `@tests/routes`) so that `jest.requireActual('@tests/routes')` never transitively loads the real middlewares (`rate-limit`, `cache`, `upload`, `route-flag`) while a `jest.mock` factory is still being evaluated. It also enforces completeness: a module added to `src/modules/` without a line here fails the "imports one router per module directory" check in `write-routes-are-guarded.test.ts`.

## Key elements

- **`ROUTED_MODULES: Record<string, Router>`** — The sole export. Keys are the directory names under `src/modules/` (e.g. `"account"`, `"api-keys"`); values are the named `router` default-export from each module's `routes.ts`. Contains 18 entries.

## Relationships

- **Imported from** test files that need to iterate or reference all module routers in a single lookup (e.g. the "imports one router per module directory" guard test).
- **Imports from** every graph neighbor listed below, pulling the `router` export from each:
    - `src/modules/account/routes.ts` → `accountRouter`
    - `src/modules/addresses/routes.ts` → `addressesRouter`
    - `src/modules/antibot/routes.ts` → `antibotRouter`
    - `src/modules/api-keys/routes.ts` → `apiKeysRouter`
    - `src/modules/audit-logs/routes.ts` → `auditLogsRouter`
    - `src/modules/cart/routes.ts` → `cartRouter`
    - `src/modules/delivery/routes.ts` → `deliveryRouter`
    - `src/modules/feedback/routes.ts` → `feedbackRouter`
    - `src/modules/inventory/routes.ts` → `inventoryRouter`
    - `src/modules/locales/routes.ts` → `localesRouter`
    - `src/modules/observability/routes.ts` → `observabilityRouter`
    - `src/modules/orders/routes.ts` → `ordersRouter`
    - `src/modules/payments/routes.ts` → `paymentsRouter`
    - `src/modules/products/routes.ts` → `productsRouter`
    - `src/modules/users/routes.ts` → `usersRouter`
- Also imports `webhooks` and `wishlist` routers (not in the graph-neighbor list above but present in the file).

## Notes

- **Static list, not auto-discovered.** Adding a new module directory under `src/modules/` requires a manual import line and a new key in `ROUTED_MODULES`; omission is caught by a dedicated test, not by the type system.
- **Consuming tests must still call `jest.mock` for middleware factories _before_ importing this file**, exactly as they would when importing any single router directly. The header of `@tests/routes` documents the underlying `jest.mock`/`requireActual` ordering constraint.
- Deliberately **not** routed through `src/modules.ts` (the app-level registry) so that importing this file pulls in only the 18 routers, not the full application wiring.
- Two routers (`webhooks`, `wishlist`) appear in this file but are **not** among the graph-neighbor list provided here; they are real imports in the source.
