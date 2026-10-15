---
source: src/modules/returns/controllers/get-return-options.ts
sha256: cf453a9da806d0d93cbd1c05029bf06aa553781feb56112743e53c4cf1588d74
generated_at: 2026-10-15T11:51:17.491325+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/get-return-options.ts

## Purpose

Express controller for `GET /returns/options?orderId=…`. Given an order ID (and the caller's identity), it asks the return service what items are still returnable and which cancellations are still possible, along with the refund each cancel would produce. It exists to keep HTTP parsing, auth extraction, and response shaping out of the service layer.

## Key elements

- **`getReturnOptions`** (exported const) — The sole export. Express request/response handler that:
  1. Validates `request.query` against the `GetReturnOptionsQueryParams` Zod schema via `parseBody`; early-returns if invalid.
  2. Reads `request.authContext` (set upstream by `isAuth` middleware) with a non-null assertion.
  3. Delegates to `returnService.getReturnOptions(orderId, authContext)`.
  4. On success, sends `result.data` through `successResponse<ReturnOptions>`; on denial, short-circuits via `refused`; on thrown error, hands off to `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `parseBody`, `refused`, and `catchAs`, the shared controller utilities used for validation, denial signaling, and error serialization.
- **`src/infrastructure/http/response.ts`** — Supplies `successResponse`, the standard envelope writer for 2xx replies.
- **`src/modules/returns/routes.ts`** — Registers `getReturnOptions` on the `GET /returns/options` route (the file that wires this handler into the router).
- **`src/modules/returns/services/index.ts`** — Provides the `returnService` instance whose `getReturnOptions` method performs the actual domain query.
- **`src/types/index.ts`** — Source of the `ReturnOptions` type used to type the success payload.

## Notes

- The handler is a plain arrow-function const, not a class method — consistent with the project's controller convention seen in the `@infrastructure/http/controller` helpers.
- `request.authContext!` relies on a runtime invariant (the `isAuth` middleware has already run). If this handler is ever mounted on an unauthenticated route, the non-null assertion will silently pass `undefined` into the service.
- Error handling is `.then/.catch` style rather than `async/await`; `catchAs` is the only error path, so any rejection (including Zod parse failure that slips through) funnels through the same serializer.
