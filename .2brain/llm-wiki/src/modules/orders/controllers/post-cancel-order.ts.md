---
source: src/modules/orders/controllers/post-cancel-order.ts
sha256: 48c42ebf6f876ae3ae939eccc55bf16c5a2ee70f33c5facfeb3173f11b76763d
generated_at: 2026-11-08T06:46:52.054293+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/controllers/post-cancel-order.ts

## Purpose

HTTP controller for `POST /orders/:id/cancel` — the single order-write operation a customer is permitted to perform. It is a thin wiring layer that validates the route params and body, extracts the caller's auth context, and delegates the actual write to `orderService.cancelOnRequestById`.

## Key elements

- **`postCancelOrder`** (exported) — Express controller function. Validates the `:id` param, parses the (optional) JSON body against the Zod schema `CancelOrderByIdBody`, reads `request.authContext`, calls the service, and either refuses the response or delegates to `respondWithOrder`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `parseBody` (Zod validation), `refused` (service-level rejection handling), and `catchAs` (unified error-to-HTTP mapping).
- **`src/infrastructure/http/ids.ts`** — provides `requireId`, which validates the `:id` param and short-circuits with a 404 if malformed.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf`, which packages the request into a context object passed alongside the service call.
- **`src/modules/orders/services/index.ts`** — source of `orderService`; the controller calls `cancelOnRequestById` on it.
- **`src/modules/orders/controllers/respond.ts`** — provides `respondWithOrder`, the shared helper that serialises the resulting order into the HTTP response.
- **`src/modules/orders/routes.ts`** — registers `postCancelOrder` as the handler for the `POST /orders/:id/cancel` route.
- **`src/types/index.ts`** — defines the `CancelOrderRequest` type used as the Express generics for the request body.

## Notes

- **Body is optional.** A customer's cancel sends no body; Express leaves `request.body` as `undefined` (not `{}`). The controller guards with `request.body ?? {}` before parsing.
- **`refund` is parsed, not read raw.** The schema enforces a boolean so that the string `"false"` (truthy in JS) cannot slip through. An absent body defaults to `{ refund: true }`.
- **Scope semantics live in the service, not here.** A non-admin can only cancel their own order in customer-allowed statuses; an admin can cancel any order. The `refund` flag is only *honored* for admins — a customer's cancel is always refunded.
- **Malformed ID short-circuits before body parsing**, returning a 404 (`orders.not-found`) so the client never learns the id was syntactically wrong vs. genuinely absent.
- **`request.authContext!`** uses a non-null assertion; the contract is that the `isAuth` middleware has already run (enforced in `routes.ts`).
