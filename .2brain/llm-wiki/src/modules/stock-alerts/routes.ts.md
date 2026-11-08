---
source: src/modules/stock-alerts/routes.ts
sha256: 271bd9877479afd89b55d39af4514458256d58fc65420a1946ab2e2a81897e95
generated_at: 2026-11-08T08:29:38.753932+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/routes.ts

## Purpose

Express route table for the stock-alerts (back-in-stock) feature. Defines the three HTTP endpoints (list, ask, cancel) and applies authentication to every route. No admin/permission key is required — the same "signed-in only" pattern used by the wishlist module.

## Key elements

- **`router`** (exported) — the Express `Router` instance that the module mounts.
- **`router.use(getAuth, isAuth)`** — global middleware for every route in this table; enforces a valid session without checking any role.
- **`GET /`** → `getStockAlerts` — list the caller's alerts.
- **`POST /`** → `postStockAlerts` — create an alert; the product goes in the request body. Intended to be idempotent (re-sending is a no-op).
- **`DELETE /:productId`** → `deleteStockAlert` — cancel a pending alert by product ID.

## Relationships

- **`src/kernel/middlewares/authorizations.ts`** — source of `getAuth` and `isAuth`, applied as route-level middleware before any controller runs.
- **`src/modules/stock-alerts/controllers/get-stock-alerts.ts`** — handler for `GET /`.
- **`src/modules/stock-alerts/controllers/post-stock-alerts.ts`** — handler for `POST /`.
- **`src/modules/stock-alerts/controllers/delete-stock-alert.ts`** — handler for `DELETE /:productId`.
- **`src/modules/stock-alerts/module.ts`** — sibling in the same feature directory; this file is its route table (the `@module` annotation and directory convention indicate module.ts mounts `router`).

## Notes

- The file deliberately omits any permission/authorization-key middleware; "signed-in" is the entire access model. Do not add role checks here without a product decision.
- `DELETE` keys on `:productId`, not an alert ID — the assumption is one alert per product per user.
- The POST idempotency note ("Repeating it is the same request") is a contract for the controller, not something this file enforces.
