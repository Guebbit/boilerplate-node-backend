---
source: src/modules/inventory/controllers/get-inventory-level.ts
sha256: d8b2fea5f7a19c1b8137947ec27a2701e83119784cc3cbffc24b67cae5738717
generated_at: 2026-11-08T05:57:13.859109+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/controllers/get-inventory-level.ts

## Purpose

HTTP controller that handles `GET /inventory/levels/:productId`, returning a single product's stock counters and availability. It validates the path parameter, delegates to the inventory service, and shapes the HTTP response.

## Key elements

- **`getInventoryLevel`** (exported) — Express handler for the route. Validates `productId` via `requireId`, calls `inventoryService.getLevel(productId)`, then sends a `successResponse<InventoryLevel>` or a refusal. Catches errors through `catchAs`.

## Relationships

- **`src/modules/inventory/routes.ts`** — Registers this handler on the `/inventory/levels/:productId` route.
- **`src/modules/inventory/services/index.ts`** — Source of `inventoryService`, whose `getLevel` method performs the actual lookup.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs` (uniform error serialisation) and `refused` (4xx short-circuit when the service signals rejection).
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which extracts and validates the `productId` param, writing a 404 (keyed `'inventory.product-not-found'`) directly to the response if absent.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, which wraps the payload in the project's standard envelope.
- **`src/types/index.ts`** — Supplies the `InventoryLevel` type used to type the success payload.

## Notes

- `requireId` writes the error response itself; the subsequent `if (!productId) return Promise.resolve()` is a guard that satisfies TypeScript without emitting a second response. Don't remove it thinking it's dead code.
- The service call is Promise-based (`.then`/`.catch`), not async/await — consistent with the rest of the controller layer.
