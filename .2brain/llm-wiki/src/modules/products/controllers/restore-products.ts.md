---
source: src/modules/products/controllers/restore-products.ts
sha256: 92814b9581c66dcd0818e2d2109ae73019ec6de21a25e64b76e1b7b7eff23011
generated_at: 2026-10-15T11:41:00.158553+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/restore-products.ts

## Purpose

Thin admin controller that wires the shared `createRestoreController` factory to the product service, exposing a single endpoint to undo a soft-deleted product (`POST /products/:id/restore`). The file contains no business logic; all domain behavior lives in `productService`.

## Key elements

- **`restoreProducts`** (exported) — The controller produced by `createRestoreController`. Accepts `{ id, request }`, calls `productService.restoreById(id, callerContextOf(request))` to restore, then maps the result through `productService.toProduct(product, request.caller)`. Returns 404 when the product doesn't exist (`products.not-found` key) and 409 when it isn't actually deleted.

## Relationships

- **`@infrastructure/surfaces/create-restore-controller`** — Supplies the `createRestoreController` factory. This file passes the entity name, the `restore` callback, the `present` serializer, and the not-found i18n key.
- **`@infrastructure/http/request`** — Provides `callerContextOf(request)` so the service can act on behalf of the authenticated admin without the controller parsing headers/claims itself.
- **`../services/index`** — Exports `productService`, which owns `restoreById` (including the `ADMIN_PRODUCT_RESTORED` audit event emission) and `toProduct` (domain → DTO mapping).
- **`routes.ts`** — Registers `restoreProducts` on the product router at `POST /products/:id/restore` (admin-protected).

## Notes

- The audit emit (`ADMIN_PRODUCT_RESTORED`) is handled inside `productService.restoreById`, not here. If you search for audit logic, go to the service layer.
- The `entity` string (`'product'`) is used by the factory for generic messages/logging; keep it lowercase singular to match other product controllers.
- Because this is a pure wiring file, any change to the restore flow (validation, permissions, side-effects) should land in `productService`, not in this controller.
