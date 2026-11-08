---
source: src/modules/products/controllers/get-product.ts
sha256: 5d0cb5a53035bff10b98b8d5e77c588ccbf0e3b51ffd72a3f630b6903575aecb
generated_at: 2026-11-08T07:42:27.166570+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/controllers/get-product.ts

## Purpose

Thin controller for `GET /products/:id`. It wires the shared `createItemController` factory to the product service, applying caller-scoped visibility so that non-active (inactive/deleted) products are only returned to admins.

## Key elements

- **`getProductItem`** (export) — the route handler produced by `createItemController`. Accepts a path `id` and the incoming `request`; delegates to `productService.getByIdForCaller` with a caller-scoped query and caller context. Configured with entity name `'product'` and i18n not-found key `'products.not-found'`.

## Relationships

- **`src/modules/products/services/index.ts`** — imports `productService`; calls `productService.callerScope(request.caller)` to build the visibility scope and `productService.getByIdForCaller(id, scope, ctx)` to fetch the row.
- **`src/infrastructure/surfaces/create-item-controller.ts`** — imports the `createItemController` factory, which provides the shared controller skeleton (parameter extraction, not-found handling, response shaping) around the `fetch` callback defined here.
- **`src/infrastructure/http/request.ts`** — imports `callerContextOf(request)` to resolve the authenticated session or API key into a `request.caller` object passed down to the service.
- **`src/modules/products/routes.ts`** — the sibling route file that registers `getProductItem` on the `GET /products/:id` path (this file is the handler it mounts).

## Notes

- Visibility is enforced *in the service layer* via `callerScope`; this controller does no role-checking itself. Non-admin callers will simply not see inactive/deleted rows.
- The `fetch` callback receives the raw path `id` and the full `request`; the `callerContextOf` call is the bridge between the HTTP layer and the domain service.
- All controller boilerplate (404 shape, parameter parsing, response envelope) is owned by `createItemController` — changes to response conventions should be made there, not here.
