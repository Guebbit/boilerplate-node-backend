---
source: src/modules/inventory/controllers/get-inventory-level.ts
sha256: d8b2fea5f7a19c1b8137947ec27a2701e83119784cc3cbffc24b67cae5738717
generated_at: 2026-10-29T03:59:07.888899+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/get-inventory-level.ts

## Purpose
Express route handler for `GET /inventory/levels/:productId`. Validates the path parameter, delegates to the inventory service, and returns a single product's counters and availability (or a structured error).

## Key elements
- **`getInventoryLevel`** (exported) — The sole handler. Resolves `productId` from the request, calls `inventoryService.getLevel`, and writes either a success payload (`InventoryLevel`) or an error/refusal response.

## Relationships
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` (unified error-to-HTTP mapping) and `refused` (determines whether a service result is a rejection that should short-circuit the response).
- **`src/infrastructure/http/ids.ts`** — Imports `requireId` to extract and validate the `productId` param, returning `null` (and sending a 404) when absent.
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to wrap the service result in the standard envelope.
- **`src/modules/inventory/routes.ts`** — Registers this handler on the `GET /inventory/levels/:productId` route.
- **`src/modules/inventory/services/index.ts`** — Source of `inventoryService.getLevel(productId)`, the actual data-fetching logic.
- **`src/types/index.ts`** — Provides the `InventoryLevel` type used to type the success payload.

## Notes
- Uses the `Promise.resolve()` early-return idiom when `requireId` fails, rather than an `async`/`void` return — keep this pattern if adding sibling handlers.
- The `notFound` key (`'inventory.product-not-found'`) is a locale/i18n identifier, not a literal string; actual message text lives elsewhere.
- The handler is a plain (non-async) function returning a Promise; `catchAs` is the only place unhandled rejections are intercepted.
