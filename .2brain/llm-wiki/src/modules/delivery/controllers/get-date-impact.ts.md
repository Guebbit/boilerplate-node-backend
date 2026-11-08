---
source: src/modules/delivery/controllers/get-date-impact.ts
sha256: 2c54d788d63b9ee7f43627d582d8f7742ca4a96f832229ad53e8e7fbee7e743d
generated_at: 2026-11-08T05:26:17.728071+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-date-impact.ts

## Purpose

Defines the two staff-facing preview endpoints (`GET /delivery/fulfillment-orders/release-date-impact` and `…/restock-date-impact`) that let a user see what would change before actually committing a date move. Both handlers are produced by a single factory so the only differences are the query field, the business cause, and the Zod schema.

## Key elements

- **`dateImpactController`** (internal factory) — takes a field name (`releaseDate` | `restockDate`), a cause (`preorder` | `backorder`), a Zod query schema, and a log name; returns an Express handler.
- **`getReleaseDateImpact`** — exported handler for the release-date preview; binds the factory to `releaseDate` / `preorder` / `PreviewReleaseDateImpactQueryParams`.
- **`getRestockDateImpact`** — exported handler for the restock-date preview; binds the factory to `restockDate` / `backorder` / `PreviewRestockDateImpactQueryParams`.

## Relationships

- **`src/infrastructure/http/request.ts`** — calls `readInput(request, { surface: 'list' })` to extract query params.
- **`src/infrastructure/http/schemas.ts`** — calls `blankToUndefined` to treat an empty date string as absent before validation.
- **`src/infrastructure/http/controller.ts`** — uses `parseBody` for schema validation, `refused` to short-circuit a rejected service result, and `catchAs` for error serialization.
- **`src/infrastructure/http/response.ts`** — calls `successResponse` to send the typed `ReleaseDateImpact` payload.
- **`src/modules/delivery/services/index.ts`** — delegates the actual impact calculation to `deliveryService.previewDateImpact`.
- **`src/modules/products/index.ts` / `src/modules/products/services/index.ts`** — reads `productService.zodProductUpdateSchema` to re-validate the candidate date against the same rules the save endpoint enforces.
- **`src/modules/shop/index.ts` / `src/modules/shop/service.ts`** — calls `startOfShopDay` to normalise the date into the shop's local day boundary before passing it to the service.
- **`src/types/index.ts`** — imports the `ReleaseDateImpact` response type.
- **`src/modules/delivery/routes.ts`** — registers `getReleaseDateImpact` and `getRestockDateImpact` on the delivery router.

## Notes

- **Blank ≠ missing:** a query param present but empty (e.g. `?releaseDate=`) is coerced to `undefined` via `blankToUndefined`, meaning "clear the date." Truly absent params are also `undefined`. Both paths reach the service as `undefined`.
- **Double validation:** the date is validated twice — first by the endpoint's own query schema, then against `productService.zodProductUpdateSchema` so the preview rejects exactly what the save would reject (format, max one-year-ahead, etc.).
- **Shop-day boundary:** `startOfShopDay` is applied to a concrete date but is bypassed for `undefined`, so a "clear" request never gets a fabricated boundary.
- **No body:** the handler reads only query params (`surface: 'list'`); a JSON body on these GETs is ignored.
