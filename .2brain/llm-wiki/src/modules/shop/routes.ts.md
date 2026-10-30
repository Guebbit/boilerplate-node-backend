---
source: src/modules/shop/routes.ts
sha256: ec00ce789a6dd7be6d377ed89e3c1b6577d2fae233f1c2d67bafca633e92ecaa
generated_at: 2026-10-29T05:52:07.089816+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop/routes.ts

## Purpose

Defines the Express route table for the shop module. It registers a single read-only endpoint (`GET /shop`) that returns the shop's identity, currency, ship-to countries, and return address. Because the response is static (changes only on redeploy) and there are no write paths, the endpoint relies solely on the global burst rate-limit for protection.

## Key elements

- **`router`** (exported) — An Express `Router` instance; the sole public export of this file. It is mounted elsewhere to expose shop routes.
- **`GET /`** — The only registered route, delegated to the `getShop` controller. No other methods or paths exist.

## Relationships

- **`src/modules/shop/controllers/get-shop.ts`** — Imported and wired as the handler for `GET /`. This file is the sole consumer of that controller.
- **`src/modules/shop/module.ts`** — The neighboring module entry point that (by convention) mounts this `router` into the parent Express app under the `/shop` prefix.

## Notes

- The module JSDoc explicitly states that no write endpoints exist here; if a future change adds mutations, the "bounded by the global burst brake alone" assumption no longer holds and needs revisiting.
- The route path is `/` (relative to the mount point), not `/shop`. The full URL is determined by how `module.ts` attaches the router.
