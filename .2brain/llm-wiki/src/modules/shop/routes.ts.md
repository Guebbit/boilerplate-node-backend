---
source: src/modules/shop/routes.ts
sha256: ec00ce789a6dd7be6d377ed89e3c1b6577d2fae233f1c2d67bafca633e92ecaa
generated_at: 2026-11-08T08:20:46.576700+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/routes.ts

## Purpose

Defines the Express route table for the shop module. It exposes a single public read endpoint (`GET /shop`) that returns the shop's static identity data (name, currency, ship-to countries, return address). Because the response changes only on redeploy and the module performs no writes, the only rate-limiting concern is the global burst brake.

## Key elements

- **`router`** (exported) — An Express `Router` instance carrying the shop module's routes. This is the single export consumed by `module.ts` to mount the shop endpoints.
- **`GET /`** — The sole route, mapped to the `getShop` controller. Returns shop metadata; no authentication or mutation logic lives here.

## Relationships

- **`src/modules/shop/controllers/get-shop.ts`** — Imported and wired as the handler for `GET /`. All response-building logic for the shop endpoint lives in that controller; this file only performs the URL-to-handler binding.
- **`src/modules/shop/module.ts`** — The consuming side: imports the `router` export from this file and mounts it into the application's route tree. No other files import from `routes.ts`.

## Notes

- The file is intentionally minimal. If a new shop endpoint is needed, it belongs here (route declaration) plus a new controller under `./controllers/`.
- The JSDoc module comment ("bounded by the global burst brake alone") is a design-intent note, not an enforcement mechanism in this file; the actual throttle lives elsewhere in the middleware stack.
