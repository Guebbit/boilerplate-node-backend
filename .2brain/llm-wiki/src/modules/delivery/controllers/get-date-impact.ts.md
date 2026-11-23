---
source: src/modules/delivery/controllers/get-date-impact.ts
source_sha256: 587a5d33b82aa0b55624b43f306bd91fae28351a158709475d7a5e2cfada24ca
context_sha256: 032bcd9523e0d40a8e3ae6db452381239947c51fa24c186ce957763fb4a0a787
generated_at: 2026-11-22T04:45:21.894389+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/delivery/controllers/get-date-impact.ts

## Purpose
Express controllers for the staff-facing preview of moving a product's release or restock date: `GET /delivery/fulfillment-orders/release-date-impact` and `.../restock-date-impact`. Input comes only from the query string, and an absent or blank date means the date is being cleared. Both handlers share one factory and return a `ReleaseDateImpact`.

## Key elements
- `dateImpactController(field, cause, schema, name)` (module-private): a factory that returns an Express `(request, response)` handler.
  - `field` is `'releaseDate'` or `'restockDate'`, the query and product field that carries the date.
  - `cause` is `'preorder'` or `'backorder'`, which tells the impact preview what the date gates.
  - `schema` is the generated zod query schema for the endpoint.
  - `name` is the handler name used in the error log.
- `getReleaseDateImpact`: the factory bound to `releaseDate`, `'preorder'`, `PreviewReleaseDateImpactQueryParams`.
- `getRestockDateImpact`: the factory bound to `restockDate`, `'backorder'`, `PreviewRestockDateImpactQueryParams`.

Handler flow:
1. Read the query with `readInput(request, { surface: 'list' })`.
2. Turn a blank date into `undefined` with `blankToUndefined`, then validate with the generated schema through `parseBody`.
3. Validate the date again with the products module's `productService.zodProductUpdateSchema`, so the preview applies the same date rules as a save.
4. Call the delivery service's `previewDateImpact(productId, cause, date)`. The date goes through `startOfShopDay`, or stays `undefined` if it was cleared.
5. If `refused(response, result)` is true, stop. Otherwise reply with `successResponse<ReleaseDateImpact>(response, result.data)`.
6. Rejections go to `catchAs(response, name)`.

## Relationships
- `src/infrastructure/http/request.ts` (`readInput`), `src/infrastructure/http/schemas.ts` (`blankToUndefined`), `src/infrastructure/http/response.ts` (`successResponse`) and `src/infrastructure/http/controller.ts` (`parseBody`, `refused`, `catchAs`) provide the shared HTTP plumbing.
- `src/modules/products/index.ts` exports `productService`, used for the save-equivalent date validation. `src/modules/products/services/index.ts` is a related neighbor in the products module.
- `src/modules/shop/index.ts` exports `startOfShopDay`, which converts the date string to the shop's start-of-day value. `src/modules/shop/service.ts` is a related neighbor in the shop module.
- `src/modules/delivery/services/index.ts` (imported as `../services`) exports `deliveryService`, which does the actual impact computation.
- `src/types/index.ts` supplies the `ReleaseDateImpact` response type (imported as `@types`).
- `src/modules/delivery/routes.ts` is the likely consumer, wiring these exports to the two routes. This file doesn't import it.

## Notes
- Both handlers return `Promise.resolve()` early when validation fails. `parseBody` has already written the error response by then.
- A cleared date is valid input. `undefined` is passed to `zodProductUpdateSchema` and to the service, meaning "no date".
- The `schema` type is `z.ZodType<{ productId: string } & Partial<Record<TField, string>>>`, so `productId` is required and the date is optional.
- Both handlers also return `ReleaseDateImpact`, even the restock one.
