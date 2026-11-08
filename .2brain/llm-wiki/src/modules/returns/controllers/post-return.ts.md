---
source: src/modules/returns/controllers/post-return.ts
sha256: befd97d59027871ec2410d7878c3bac60de509f8ae149afcca852b49a6cee869
generated_at: 2026-11-08T07:56:55.947789+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/controllers/post-return.ts

## Purpose

HTTP handler for `POST /returns`. Opens a return record and responds 201 with a `Location` header. The same endpoint doubles as the EU withdrawal button (distinguished by `reason: withdrawal` in the body). It is a thin controller: it validates/parses the request, delegates to the return service, and formats the HTTP response.

## Key elements

- **`postReturn(request, response)`** (exported) — The sole handler. Steps:
  1. Validates the body against the `CreateReturnBody` Zod schema via `parseBody`.
  2. Converts `requestedAt` from an ISO-8601 string to a `Date` (omitted entirely if absent).
  3. Calls `returnService.createReturn(body, authContext, callerContext)`.
  4. On success, wraps the result with `returnService.withActions(…)` and sends 201 + `Location: /returns/:id`.
  5. On service-level refusal or error, delegates to `refused` / `catchAs`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Imports `parseBody`, `refused`, `catchAs` — shared validation/error helpers. |
| `src/infrastructure/http/request.ts` | Imports `callerContextOf` to extract the authenticated caller's context from the request. |
| `src/infrastructure/http/response.ts` | Imports `createdResponse` to build the 201 + `Location` reply. |
| `src/modules/returns/routes.ts` | Registers `postReturn` on the `POST /returns` route. |
| `src/modules/returns/services/index.ts` | Imports `returnService`; all domain logic (creating the return, computing actions) lives there. |
| `src/types/index.ts` | Imports the `Return` type used as the generic on `createdResponse`. |

## Notes

- **Always 201.** Even a withdrawal that closes the return "at birth" (order not yet dispatched) returns `201 Created`, not 200 or 409.
- **`authContext` is asserted with `!`.** The comment states `isAuth` middleware guarantees it; the controller does not handle the unauthenticated case itself.
- **`requestedAt` is optional.** If the client omits it, the key is stripped from the object passed to the service rather than being sent as `undefined`.
- **`withActions`** is called *after* `createReturn` resolves and *before* the response is sent, so the serialized `Return` carries per-caller action URLs.
