---
source: src/modules/returns/controllers/post-return.ts
sha256: befd97d59027871ec2410d7878c3bac60de509f8ae149afcca852b49a6cee869
generated_at: 2026-10-29T05:36:49.963212+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return.ts

## Purpose

HTTP handler for `POST /returns`. Opens a return record and responds **201 Created** with a `Location` header. The same endpoint doubles as the EU 14-day withdrawal button (distinguished only by `reason: "withdrawal"` in the body); in that case the return is closed at birth if it reaches the order before dispatch, canceling the order.

## Key elements

- **`postReturn(request, response)`** — sole export; the Express handler for `POST /returns`.
  - Validates the body against the `CreateReturnBody` Zod schema via `parseBody`.
  - Converts `requestedAt` (ISO string) to a `Date` before delegating to the service.
  - Reads the authenticated caller from `request.authContext!` (set upstream by `isAuth`).
  - Calls `returnService.createReturn(body, authContext, callerContext)`.
  - On success, augments the entity with `returnService.withActions(...)` and sends a 201 with `Location: /returns/:id`.
  - On rejection, delegates to `refused()`; on thrown error, delegates to `catchAs(response, 'postReturn')`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — source of `parseBody`, `refused`, and `catchAs` helpers used for validation, rejection, and error mapping.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf(request)` to extract the acting user/IP for audit context.
- **`src/infrastructure/http/response.ts`** — provides `createdResponse`, the 201 + `Location` writer.
- **`src/modules/returns/routes.ts`** — registers `postReturn` as the handler for the `POST /returns` route.
- **`src/modules/returns/services/index.ts`** — exports `returnService`, whose `createReturn` and `withActions` methods perform the domain work.
- **`src/types/index.ts`** — source of the `Return` entity type used to type the 201 response body.

## Notes

- The withdrawal path is **not** a separate route; it is the same handler gated entirely by the `reason` field in the request body.
- `request.authContext!` uses a non-null assertion — the file assumes `isAuth` middleware has already populated it; calling the handler without that middleware will crash at runtime rather than fail gracefully.
- `requestedAt` is optional in the schema; when absent the service is expected to use its own timestamp.
- The controller never returns 200 — it is always 201 (or a 4xx from `refused`/`catchAs`).
