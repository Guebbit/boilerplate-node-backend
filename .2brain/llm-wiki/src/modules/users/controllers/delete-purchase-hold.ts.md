---
source: src/modules/users/controllers/delete-purchase-hold.ts
sha256: e6add7643907246da97e1ac43d09f0ec649b3d8626cc93349524a70a440a1588
generated_at: 2026-11-08T08:43:49.663210+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/delete-purchase-hold.ts

## Purpose

Controller for `DELETE /users/:id/purchase-hold`. It lifts (ends) the staff-imposed pause on a user's purchase functionality and restarts the cancellation count. The controller is intentionally thin: it extracts the ID, delegates the business logic to `userService.liftPurchaseHold`, and shapes the HTTP response.

## Key elements

- **`deletePurchaseHold`** (exported) — The Express route handler, wrapped in `namedHandler('liftUserPurchaseHold', …)`. Reads the user ID from the request, calls `userService.liftPurchaseHold`, then maps the result through `userService.toUserContract` before sending a `200` response.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `namedHandler` (handler wrapper + naming), `refused` (short-circuit for service-level refusals), and `catchAs` (uniform error serialization).
- **`src/infrastructure/http/ids.ts`** — `requireId` extracts and validates the `:id` param; aborts with a 404 (`users.not-found`) if missing.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` pulls the authenticated caller's context, forwarded to the service for authorization and audit.
- **`src/infrastructure/http/response.ts`** — `successResponse` sends the final `200` JSON body.
- **`src/modules/users/routes.ts`** — Wires this handler to the `DELETE /users/:id/purchase-hold` route.
- **`src/modules/users/services/index.ts`** — Provides `userService`, whose `liftPurchaseHold` performs the state change and `toUserContract` shapes the response payload.

## Notes

- The service layer owns the 404 (user not found), the 403 (attempting to lift a hold on a staff account), and the audit row. The controller performs no authorization logic itself.
- `refused(response, result)` is checked *after* `liftPurchaseHold` resolves but *before* the success path; it lets the service signal a domain-level rejection that should not be treated as an unhandled error.
- The `namedHandler` key (`'liftUserPurchaseHold'`) differs from the exported identifier (`deletePurchaseHold`); error logs and metrics will reference the former.
