---
source: src/modules/returns/controllers/get-return-options.ts
sha256: cf453a9da806d0d93cbd1c05029bf06aa553781feb56112743e53c4cf1588d74
generated_at: 2026-11-08T07:55:49.792111+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/get-return-options.ts

## Purpose

Controller for `GET /returns/options?orderId=`. Given an order ID, it asks the return service what the order can still send back and cancel (with the refund each cancel would owe), then serializes that into a JSON response. The server computes the options; the client only displays them.

## Key elements

- **`getReturnOptions`** (exported const) — Express handler. Validates `orderId` via the `GetReturnOptionsQueryParams` zod schema, reads `request.authContext`, delegates to `returnService.getReturnOptions`, and writes a success or refusal response.
- **`parseBody(GetReturnOptionsQueryParams, …)`** — Reuses the shared param-validation helper from the HTTP infrastructure (despite the name, it validates `request.query` here).
- **`refused(response, result)`** — Shared guard: if the service result carries a refusal, it sends the error response and short-circuits.
- **`catchAs(response, 'getReturnOptions')`** — Shared catch-all that maps unhandled rejections to a structured error response tagged with the controller name.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Source of `catchAs`, `parseBody`, and `refused`; the generic request-validation / error-mapping layer.
- **`src/infrastructure/http/response.ts`** — Source of `successResponse`, the standard 200-envelope writer.
- **`src/modules/returns/routes.ts`** — Registers `getReturnOptions` on the `GET /returns/options` route (with `isAuth` middleware upstream).
- **`src/modules/returns/services/index.ts`** — Exports `returnService`, whose `.getReturnOptions(orderId, authContext)` method performs the actual domain logic.
- **`src/types/index.ts`** — Exports the `ReturnOptions` type used as the generic on `successResponse` and as the service's return shape.

## Notes

- `request.authContext!` uses a non-null assertion; correctness depends on the `isAuth` middleware having run first (enforced by route registration, not by this file).
- `parseBody` is the shared name for input validation even when the input is a query string, not a request body.
- The `catchAs` second argument (`'getReturnOptions'`) is a log/trace tag, not a dynamic lookup.
