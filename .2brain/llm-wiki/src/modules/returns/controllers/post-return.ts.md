---
source: src/modules/returns/controllers/post-return.ts
sha256: acbf5c3f59f1ec813fc800d87b77e3fefaf1708bcd971946a9f6f455ad87576a
generated_at: 2026-10-15T11:52:00.407983+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return.ts

## Purpose

HTTP handler for `POST /returns`. Opens a return request, or (when the body carries `reason: "withdrawal"`) exercises the EU 14-day withdrawal right. In every successful case the endpoint responds `201` with a `Location` header pointing at the new resource — there is no plain-`200` path.

## Key elements

- **`postReturn`** (exported) – Express handler. Parses and validates the request body against `CreateReturnBody`, reads the authenticated caller from `request.authContext` (populated by an upstream `isAuth` middleware), delegates to `returnService.createReturn`, then resolves the created entity through `returnService.withActions` and emits a localized status message.

## Relationships

- **`@infrastructure/http/controller`** – supplies `parseBody` (zod validation) and `catchAs` (error → HTTP mapping) used on every code path.
- **`@infrastructure/http/response`** – supplies `createdResponse` (201 + `Location`) and `rejectResponse` (4xx with error array).
- **`@infrastructure/http/request`** – supplies `callerContextOf` to extract the caller identity passed into the service.
- **`@infrastructure/i18n`** – supplies `t()` to pick the correct status message (`requested`, `withdrawn`, or `remainder-cancelled`) before the 201 body.
- **`../services`** (`src/modules/returns/services/index.ts`) – the sole domain dependency; calls `returnService.createReturn` and `returnService.withActions`.
- **`@types`** (`src/types/index.ts`) – imports the `Return` type used as the generic parameter of `createdResponse`.
- **`../routes`** (`src/modules/returns/routes.ts`) – registers `postReturn` as the handler for the `POST /returns` route (this file is a leaf; routes.ts is the importer).

## Notes

- The non-null assertion `request.authContext!` is safe only because `isAuth` middleware runs before this handler; removing that middleware from the route chain will surface as a runtime crash, not a compile error.
- "Closed at birth" is a domain concept: a withdrawal that arrives before dispatch cancels the order and the return is immediately `closed`. A *remainder* cancellation (partial shipment already left) is a distinct `kind: "cancellation"` and gets its own i18n key.
- The endpoint is deliberately idempotent-by-design at the HTTP level (always 201), so clients can retry without distinguishing "created" from "already closed".
- `src/infrastructure/i18n/context.ts` does not appear directly in this file's imports; it is a transitive dependency reached through the `@infrastructure/i18n` barrel.
