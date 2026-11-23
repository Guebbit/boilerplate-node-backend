---
source: src/modules/stock-alerts/routes.ts
source_sha256: 271bd9877479afd89b55d39af4514458256d58fc65420a1946ab2e2a81897e95
context_sha256: dfa1c586f4847e87d78204d2080e4d9ad6ce119330aa993be92e858ec4a071f8
generated_at: 2026-11-22T07:55:23.500291+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/routes.ts

## Purpose
Defines the Express router for back-in-stock requests. Users can ask to be notified about a product, cancel that request, or list their own requests. The whole router requires authentication and has no admin or permission-key checks, as with the wishlist.

## Key elements
- `router`: the exported Express `Router`.
- `router.use(getAuth, isAuth)`: applies authentication to every route below it. The code comment says this is so account erasure covers the rows.
- `GET /` → `getStockAlerts`: lists stock alerts.
- `POST /` → `postStockAlerts`: creates a request, with the product in the request body. The comment says repeating it is the same request.
- `DELETE /:productId` → `deleteStockAlert`: cancels a request before it is answered.

## Relationships
- `src/kernel/middlewares/authorizations.ts`: supplies `getAuth` and `isAuth`, which guard the whole router.
- `src/modules/stock-alerts/controllers/get-stock-alerts.ts`, `src/modules/stock-alerts/controllers/post-stock-alerts.ts` and `src/modules/stock-alerts/controllers/delete-stock-alert.ts`: supply the handlers for the three routes.
- `src/modules/stock-alerts/module.ts`: a neighbor in the dependency graph. This file does not show how the router is mounted. The comments imply the `/stock-alerts` base path.

## Notes
- The route comments show paths as `/stock-alerts`, but the router itself registers `/` and `/:productId`. The prefix is applied outside this file.
- Authentication is applied before any route is registered, so there are no unauthenticated endpoints.
