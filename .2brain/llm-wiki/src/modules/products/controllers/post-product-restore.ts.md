---
source: src/modules/products/controllers/post-product-restore.ts
sha256: 92814b9581c66dcd0818e2d2109ae73019ec6de21a25e64b76e1b7b7eff23011
generated_at: 2026-11-08T07:42:47.098234+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/post-product-restore.ts

## Purpose
Thin admin controller that exposes `POST /products/:id/restore` to undo a product's soft delete. It exists solely to wire the shared `createRestoreController` factory to product-specific service calls, keeping the module's routing layer consistent with other entities.

## Key elements
- **`restoreProducts`** (export) — The controller handler produced by `createRestoreController`. It:
  - Calls `productService.restoreById(id, callerContext)` on restore.
  - Serialises the response via `productService.toProduct(product, request.caller)`.
  - Returns a localised 404 using the i18n key `products.not-found`.

## Relationships
- **`src/infrastructure/surfaces/create-restore-controller.ts`** — Provides the `createRestoreController` factory that defines the common HTTP contract (status codes, error shape) for any entity restore endpoint.
- **`src/infrastructure/http/request.ts`** — Supplies `callerContextOf`, which extracts the authenticated caller from the raw HTTP request and passes it into the service layer.
- **`src/modules/products/services/index.ts`** — Exports `productService`, whose `restoreById` performs the actual unscheduling and emits the `ADMIN_PRODUCT_RESTORED` audit event, and whose `toProduct` handles response shaping.
- **`src/modules/products/routes.ts`** — Imports `restoreProducts` and mounts it on the `POST /products/:id/restore` route with the admin guard.

## Notes
- The controller contains no business logic; all domain rules (including the 409 "not deleted" guard and the audit emit) live in `productService.restoreById`.
- `notFoundKey: 'products.not-found'` is the i18n key used when the `:id` doesn't resolve to a product — it is separate from the 409 "not deleted" case handled by the factory.
