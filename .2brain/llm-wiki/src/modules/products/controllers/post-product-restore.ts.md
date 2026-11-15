---
source: src/modules/products/controllers/post-product-restore.ts
sha256: 5bf83cce2f843b52ec78ba7fd979cc0292ef685a3bcc7f0b869e5e91a963b456
generated_at: 2026-11-14T21:22:21.386623+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/post-product-restore.ts

## Purpose

Admin controller that exposes `POST /products/:id/restore` to undo a soft-deleted product. It is a thin wiring layer: all restore semantics (conflict detection, audit emission, response shaping) live in the product service; this file only maps HTTP concerns to the shared restore-controller factory.

## Key elements

- **`restoreProducts`** (named export) — the route handler produced by `createRestoreController`. Accepts a product `id`, delegates to `productService.restoreById`, and returns a caller-appropriate representation via `productService.presentForCaller`. Uses the i18n key `products.not-found` for the 404 case.

## Relationships

- **`src/infrastructure/surfaces/create-restore-controller.ts`** — provides the `createRestoreController` factory that structures the endpoint (not-found → 404, not-deleted → 409, success → 200). This file supplies the three callbacks (`restore`, `present`) and configuration.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf(request)` to extract the caller/authorization context forwarded into the service call.
- **`src/modules/products/services/index.ts`** — exports `productService`, whose `restoreById` method handles the restore (including the `ADMIN_PRODUCT_RESTORED` audit emit) and whose `presentForCaller` method serialises the product for the given caller role.

## Notes

- The 409 "not deleted" check is handled inside `createRestoreController`; it is not visible in this file.
- `callerContextOf(request)` (full request) and `request.caller` (passed to `presentForCaller`) are two different extraction paths — don't conflate them when refactoring.
- Audit emission is the service's responsibility, not the controller's; adding a log here would duplicate the event.
