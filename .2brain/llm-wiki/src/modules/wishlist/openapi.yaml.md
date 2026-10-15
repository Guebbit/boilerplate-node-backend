---
source: src/modules/wishlist/openapi.yaml
sha256: 28c6fa11c506085e4f600df8570daba3a7a328ab1fb681d64e9865b0f05be4b9
generated_at: 2026-10-15T12:26:51.803148+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the wishlist module. Defines the REST endpoints (list, save, remove, move-to-cart), their schemas, and the module's section in the account personal-data export. Serves as the single source of truth for the wishlist API surface that implementers, clients, and test suites code against.

## Key elements

- **`GET /wishlist`** — returns the authenticated user's saved product IDs. Empty and absent are the same state; never 404.
- **`PUT /wishlist/{productId}`** — idempotent save. No body. Saving an already-saved product returns the same 200 (RFC 9110 §9.3.4). Hidden/soft-deleted products → 404; `purchasable: false` is still saveable.
- **`DELETE /wishlist/{productId}`** — removes a saved line. A product not on the caller's wishlist → 404 (stale client signal).
- **`POST /wishlist/{productId}/move-to-cart`** — the wishlist's exit. Writes the cart line first, then removes the wishlist line, so a mid-failure leaves the product saved rather than lost. Shoppers only (staff/admin → 403); existing cart line at 999 → 422 `CART_QUANTITY_LIMIT`.
- **`WishlistItem`** — a line: `productId` + `availability`. Deliberately no quantity; the wishlist answers "do I want this," not "how many."
- **`WishlistExportItem`** — stripped-down line (productId only) used in the `x-personal-data` account export.
- **`WishlistResponse` / `WishlistResponseEnvelope`** — the standard `items` array and the shared `success/status/message/data` envelope wrapper.
- **`x-personal-data.wishlist`** — extension that the bundler merges into `AccountExportResponse`; removing the module removes this section.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — referenced for shared components: `Id`, `EnvelopeSuccess/Status/Message`, `ProductIdPathParam`, and the standard error responses (`Unauthorized`, `NotFound`, `InternalError`, `Forbidden`, `ValidationError`). This file does not redefine them.
- **`src/modules/wishlist/module.yaml`** — the module manifest that declares this `openapi.yaml` as the module's API contract and wires it into the build/bundling pipeline.

## Notes

- `WishlistItem.availability` reuses the cart module's `LineAvailability` enum (`../cart/openapi.yaml`). It never reports `insufficient_stock` because a wishlist line has no quantity; a `removed` product keeps its line and can be reactivated.
- The 404 on `move-to-cart` for a no-longer-visible product is semantically the *cart's* answer (decided once at the cart layer), not the wishlist's. Same for the 422 quantity-limit response.
- PUT vs. POST on save is intentional: "this product is saved" is a yes/no state on a URI, matching the GitHub starred-repo `PUT`/`DELETE` pattern. A double-clicked heart is not an error.
- All responses use the shared envelope (`WishlistResponseEnvelope`); raw schema objects are never returned directly.
