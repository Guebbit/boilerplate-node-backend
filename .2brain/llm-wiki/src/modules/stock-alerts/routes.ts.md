---
source: src/modules/stock-alerts/routes.ts
sha256: 271bd9877479afd89b55d39af4514458256d58fc65420a1946ab2e2a81897e95
generated_at: 2026-10-29T05:59:18.248618+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/routes.ts

## Purpose

Defines the Express router for the stock-alerts (back-in-stock) feature. All three routes are authenticated (signed-in user only, no permission key), so a request always belongs to the caller's own account. The file wires the three controllers to their HTTP methods and applies the auth middleware once for the whole group.

## Key elements

- **`router`** (export) — the `express.Router` instance that `module.ts` mounts under `/stock-alerts`.
- **`router.use(getAuth, isAuth)`** — applies both middlewares to every route below; no individual route re-declares them.
- **`router.get('/', getStockAlerts)`** — list the caller's back-in-stock requests.
- **`router.post('/', postStockAlerts)`** — create (or re-assert) a back-in-stock request; product identifier comes from the request body. Idempotent: repeating the call is treated as the same request.
- **`router.delete('/:productId', deleteStockAlert)`** — cancel a pending request by product id, but only before it has been answered.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — supplies `getAuth` and `isAuth`, which are applied as router-level middleware before any handler runs.
- **`src/modules/stock-alerts/controllers/get-stock-alerts.ts`** — provides the `getStockAlerts` handler for `GET /`.
- **`src/modules/stock-alerts/controllers/post-stock-alerts.ts`** — provides the `postStockAlerts` handler for `POST /`.
- **`src/modules/stock-alerts/controllers/delete-stock-alert.ts`** — provides the `deleteStockAlert` handler for `DELETE /:productId`.
- **`src/modules/stock-alerts/module.ts`** — imports and mounts the exported `router` into the application's route tree.

## Notes

- Authentication is "signed-in only" (no permission key), mirroring the wishlist module. This keeps the data scoped to the user's own account, so account deletion naturally covers the rows.
- `POST /` is intentionally idempotent — the comment states "Repeating it is the same request," meaning the controller deduplicates rather than creating a second alert.
- `DELETE` is only meaningful while the alert is still pending ("cancel before it is answered"); behavior after the alert is resolved is governed by the controller, not the route.
