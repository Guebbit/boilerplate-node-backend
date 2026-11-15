---
source: src/modules/cart/openapi.yaml
sha256: a84da4f3a6716a2f63434623a6fd8c399faebf94139eb4598a094869a6c38868
generated_at: 2026-11-14T19:29:20.715174+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the cart module. It defines the HTTP surface for reading, mutating, and clearing the signed-in user's cart (add, set-quantity, remove, clear) and declares the module's error-code vocabulary and its contribution to the account data export. It exists so that every consumer—front-end, SDK, test harness—shares a single machine-readable source of truth for the cart API.

## Key elements

- **`x-error-codes`** — Module-scoped error-code table (`CART_ADDRESS_NOT_APPLICABLE`, `CART_CHANGED`, `CART_EMPTY`, `CART_INSUFFICIENT_STOCK`, `CART_LINE_LIMIT_REACHED`, `CART_OPEN_ORDER_LIMIT_REACHED`, `CART_PAYMENT_METHOD_NOT_AVAILABLE`, `CART_PRODUCT_UNAVAILABLE`, `CART_PURCHASE_HOLD`, `CART_QUANTITY_LIMIT`, `CART_SHIPPING_*`, `CART_TOTAL_CHANGED`, `EMAIL_NOT_VERIFIED`, `REORDER_UNAVAILABLE`, etc.). Each entry carries the HTTP status and a human-readable description; many include `errors[].details` shape guidance.
- **`x-personal-data`** — Declares the `cart` section of `POST /account/export`; the bundler splices it into `AccountExportResponse`. Removing this key removes the section.
- **`tags`** — Single tag `Cart` (x-family: Buying) under which all operations are grouped.
- **`paths`**
  - `GET /cart` (`getCart`) — returns `CartResponse`; never paginated.
  - `POST /cart/items` (`addCartItem`) — adds or grows a line; requires `Idempotency-Key` header; returns the full cart.
  - `DELETE /cart/items` (`clearCart`) — empties the cart; bodyless by design (415 if a body is sent).
  - `PATCH /cart/items/{productId}` (`updateCartItemByProductId`) — sets (not increments) a line's quantity; never creates a line.
  - `DELETE /cart/items/{productId}` — removes one line (content truncated in source).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — All shared responses (`Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `UnsupportedMediaType`) and parameters (`IdempotencyKeyHeader`, `ProductIdPathParam`) are pulled in via `$ref` into that file's `#/components/…`. This file never redefines them.

## Notes

- The file uses OpenAPI **3.1.0** (JSON Schema 2020-12 semantics), not 3.0.
- `POST /cart/items` is idempotency-keyed: the same key with the same body replays the first response; the same key with a *different* body yields 422 `IDEMPOTENCY_KEY_MISMATCH`.
- `PATCH` accepts both `application/json` and `application/merge-patch+json` content types but rejects other media types with 415.
- `DELETE /cart/items` (clear-all) is deliberately bodyless to distinguish it from the single-line `DELETE /cart/items/{productId}`; sending a body to the clear endpoint returns 415.
- Error-code descriptions reference server-side env vars (`NODE_CART_MAX_LINES`, `NODE_MAX_OPEN_UNPAID_ORDERS_PER_ACCOUNT`) and sibling operations (`POST /payments`, `POST /orders/{id}/cancel`, `POST /account/email-verification/resend`) for client-side guidance.
- The content in this repo is truncated after the single-line DELETE; the full spec (checkout, reorder, and remaining schemas) lives in the complete file.
