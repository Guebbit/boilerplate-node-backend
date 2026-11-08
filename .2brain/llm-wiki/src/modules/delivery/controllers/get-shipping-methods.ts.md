---
source: src/modules/delivery/controllers/get-shipping-methods.ts
sha256: 5a57ed6bf61227db7b1f3ff688d9221aad71856115230e24768f471f90200026
generated_at: 2026-11-08T05:26:56.379993+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/controllers/get-shipping-methods.ts

## Purpose

Express route handler for `GET /delivery/methods`. Returns the full list of shipping methods the shop offers (flat rates, free-above thresholds, etc.). Deliberately public so a guest can see shipping costs before deciding to sign up.

## Key elements

- **`getShippingMethods`** *(exported const)* — The sole handler. Calls `deliveryService.listMethods()`, then wraps the (always-present) `result.data` in `successResponse<ShippingMethodsResponse>` and sends it back. No branching, no error path — `listMethods` is documented to always succeed.

## Relationships

- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to shape the HTTP reply.
- **`src/modules/delivery/services/index.ts`** — Imports `deliveryService` and calls its `listMethods()` method to fetch the data.
- **`src/types/index.ts`** — Imports the `ShippingMethodsResponse` type to parameterize the response generic.
- **`src/modules/delivery/routes.ts`** — Registers this handler on the `GET /delivery/methods` route (implied by the module docblock; the routes file wires the endpoint to this function).

## Notes

- **No `?weight=` filter by design.** The full list is always returned. Weight-fit validation is the job of the write-side endpoints (`PUT /cart/shipping-method`, `POST /cart/checkout`), which check against the actual basket server-side. Clients read this list and let those endpoints tell them which methods are actually usable.
- Because `listMethods()` is guaranteed to succeed, the controller has no `try/catch` and no failure branch — adding one would be dead code.
