---
source: src/modules/shop/routes.ts
source_sha256: 72f529121d7e7f5fde142373e9353bf5b365ffa5c91fb7358108b0af2155c7de
context_sha256: 3526dd3ba7b8e8246d5a0f25388061e2df4bc0a99f8494cd56a9d7e06c0f5f3a
generated_at: 2026-11-22T07:47:23.180234+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop/routes.ts

## Purpose
Defines the Express route table for the shop module: a single public, read-only endpoint. Per the module doc, nothing here writes and the response only changes on redeploy, so the route is limited only by the global burst brake.

## Key elements
- `router` — exported Express `Router` for shop endpoints.
- `GET /` — registered with `environmentCache` followed by the `getShop` handler. It returns the shop's identity, currency, ship-to countries and return address (per the inline comment).

## Relationships
- `src/infrastructure/http/middlewares/cache.ts` — supplies `environmentCache`, the middleware applied before the handler on `GET /`.
- `src/modules/shop/controllers/get-shop.ts` — supplies `getShop`, the controller that handles the request.
- `src/modules/shop/module.ts` — a graph neighbor of this file. The file itself doesn't show how the two connect, though `router` is exported for consumption.

## Notes
- The route is relative to the router (`'/'`). The `/shop` prefix is not set here, so it must come from wherever the router is mounted.
- No route-specific rate limiting or auth is configured. This is intentional per the module doc.
