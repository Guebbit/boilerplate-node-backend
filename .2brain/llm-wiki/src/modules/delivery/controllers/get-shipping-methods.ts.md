---
source: src/modules/delivery/controllers/get-shipping-methods.ts
sha256: 688146efc5166be137582bd35a4aad5627d36f89818ef466eccde57b5dcb602f
generated_at: 2026-09-23T18:35:26.578472+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-shipping-methods.ts

## Purpose

Express route handler for `GET /delivery/methods`. Exposes the shop's available shipping methods (flat rates, free-above thresholds) as a public, unauthenticated endpoint so that guests can evaluate shipping costs before signing up. Accepts an optional `weight` query parameter to filter the list.

## Key elements

- **`getShippingMethods`** (exported function) — The sole handler. Parses `weight` from the query string via `weightSchema.safeParse`, delegates to `deliveryService.listMethods(weight)`, and sends the result through `successResponse<ShippingMethodsResponse>`. There is no error branch: the service is contractually guaranteed to return a successful payload.

## Relationships

- **`src/modules/delivery/routes.ts`** — Registers this handler as the target for `GET /delivery/methods`.
- **`src/modules/delivery/service.ts`** — Provides `deliveryService.listMethods(weight)`, the domain logic that returns the filtered method list.
- **`src/infrastructure/http/schemas.ts`** — Supplies `weightSchema` for safe, non-throwing parse of the `weight` query parameter.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the shared helper that serialises the payload and sets the HTTP status.
- **`src/types/index.ts`** — Defines the `ShippingMethodsResponse` shape used as the generic type parameter on `successResponse`.

## Notes

- **Lenient `weight` handling.** A missing, blank, non-numeric, or negative `weight` all resolve to `undefined` (i.e. "no filter"). This is deliberate: the endpoint is advisory, so a bad value degrades to the unfiltered list rather than returning 422. Contrast with required-scalar handlers in other controllers that *do* branch on parse failure.
- **No error path in this controller.** All HTTP-error concerns are absorbed by `deliveryService.listMethods`; this file always calls `successResponse`.
- **Public endpoint.** No authentication middleware is applied here; the route is intentionally accessible to guests.
