---
source: src/modules/shop-tasks/services/work-summary.ts
sha256: aba618ed4188fbbc21d46e2a47c8ce925b446edcab25afd41ba69f9d162484d0
generated_at: 2026-11-08T08:17:22.120759+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/services/work-summary.ts

## Purpose

Computes the per-screen "work badge" counts shown in staff navigation. Each count is read through the owning module's own list function with the caller's context, so the badge number always matches what the corresponding screen would display.

## Key elements

- **`workSummary(caller)`** *(exported)* — Filters `BADGES` by permission, runs each allowed count in parallel, and returns a `ShopWorkSummary` object. Only keys the caller may open are present; zero counts are still included.
- **`BADGES`** — Read-only array of five `Badge` entries in nav order: `salesOrders`, `salesPayments`, `returns`, `salesPreorders`, `inventory`.
- **`Badge`** *(interface)* — `key`, `opens` (synchronous permission gate), `count` (async count).
- **`mayOpen(action, subject)`** — Curried permission check combining `callerForSubject` + `holds`.
- **`ONE_ROW`** — `{ pageSize: 1 }`; every list call fetches one row only to read `meta.totalItems`.
- **`totalOf`** — Extracts `meta.totalItems` from a paginated response.
- **`ordersWith(status, caller)`** — Queries `orderService.search` for a single status with `deleted: false`; used twice to sum `paid` + `processing` for `salesOrders`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@kernel/ability` | Imports `holds` for permission evaluation in `mayOpen`. |
| `@kernel/permissions` | Imports `callerForSubject`, `ActionOn`, `PermissionSubject`. |
| `@types/auth-context` | Imports `AuthContext` and `ShopWorkSummary` types. |
| `@modules/orders` | Calls `orderService.search` for the `salesOrders` count. |
| `@modules/payments` | Calls `paymentService.listAttention` for the `salesPayments` count. |
| `@modules/returns` | Calls `returnService.listReturns` for the `returns` count. |
| `@modules/delivery` | Calls `deliveryService.listPreorderFulfillmentOrders` for the `salesPreorders` count. |
| `@modules/inventory` | Calls `inventoryService.listLevels` for the `inventory` count. |
| `shop-tasks/controllers/get-shop-work-summary.ts` | Upstream controller that invokes `workSummary`. |
| `shop-tasks/services/index.ts` | Barrel re-exports `workSummary`. |

## Notes

- The `ordersWith` call deliberately **omits the third argument** to `orderService.search`; passing a caller context there would fire an `orders_viewed` analytics event, which is undesirable for a passive badge refresh.
- `salesOrders` requires **two** list calls because the order status filter accepts only a single value.
- Permission actions are intentionally varied: `display` on `Order`/`Payment` vs. `read` on `Return`/`StockLevel` — matching each screen's route gate rather than a uniform action.
- `salesPayments` and `inventory` counts take **no caller argument** (no caller-scoped filtering needed), while the other three do.
- `Object.fromEntries` types keys as `string`; the `as ShopWorkSummary` cast is safe because every key is a `Badge.key` (`keyof ShopWorkSummary`).
