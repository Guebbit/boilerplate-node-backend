---
source: src/modules/delivery/controllers/get-date-impact.ts
sha256: f0482b74c63195e1b4ae3aea0e90ec40fefa1b635dcd22c2cc8857691dcf3bc0
generated_at: 2026-10-29T03:31:16.877813+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-date-impact.ts

## Purpose
Implements two read-only staff preview endpoints that show the fulfillment-order impact of moving a product's release or restock date. A single generic factory (`dateImpactController`) is parameterised per field so both handlers share identical validation and delegation logic.

## Key elements
- **`dateImpactController`** (internal) — Generic handler factory. Accepts the date field name, the `cause` string (`'preorder' | 'backorder'`), a Zod query schema, and a log name. Returns an Express handler that:
  1. Reads query params via `readInput`.
  2. Converts a blank date string to `undefined` (`blankToUndefined`) so it passes the generated schema.
  3. Re-validates the date against `productService.zodProductUpdateSchema` to mirror the save-time rules (format, max one year ahead).
  4. Delegates to `deliveryService.previewDateImpact(productId, cause, date?)`.
- **`getReleaseDateImpact`** (export) — Binds the factory to `releaseDate` / `'preorder'` / `PreviewReleaseDateImpactQueryParams`. Handles `GET /delivery/fulfillment-orders/release-date-impact`.
- **`getRestockDateImpact`** (export) — Binds the factory to `restockDate` / `'backorder'` / `PreviewRestockDateImpactQueryParams`. Handles `GET /delivery/fulfillment-orders/restock-date-impact`.

## Relationships
- **`src/infrastructure/http/request.ts`** — `readInput` extracts query params from the Express request.
- **`src/infrastructure/http/schemas.ts`** — `blankToUndefined` normalises an empty-string date to `undefined` before Zod parsing.
- **`src/infrastructure/http/controller.ts`** — Provides `parseBody` (schema validation + early-return on failure), `refused` (error-result short-circuit), and `catchAs` (async error wrapper for logging).
- **`src/infrastructure/http/response.ts`** — `successResponse` serialises the `ReleaseDateImpact` payload.
- **`src/modules/products/index.ts` → `src/modules/products/services/index.ts`** — `productService.zodProductUpdateSchema` is reused as the authoritative date-format/range validator.
- **`src/modules/delivery/services/index.ts`** — `deliveryService.previewDateImpact` performs the actual impact calculation.
- **`src/modules/delivery/routes.ts`** — Registers `getReleaseDateImpact` / `getRestockDateImpact` on the delivery router.
- **`src/types/index.ts`** — Supplies the `ReleaseDateImpact` response type.

## Notes
- **Blank ≠ missing.** A query value of `""` is explicitly converted to `undefined` *before* the generated Zod schema runs; the schema itself treats `undefined` as "date cleared." Forgetting this step would make a blank date fail validation instead of representing a clear.
- **Double validation is intentional.** The date is checked twice: once by the endpoint's own query schema (presence, `productId`) and once by the product-update schema (format, max-range). This keeps the preview consistent with what a subsequent save would accept or reject.
- **GET, no body.** All input arrives via query string; there is no request body to parse.
