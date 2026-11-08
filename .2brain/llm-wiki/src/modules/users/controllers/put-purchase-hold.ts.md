---
source: src/modules/users/controllers/put-purchase-hold.ts
sha256: 855f8396c0bb612f5f29d42bcf81e8d0fceab435777b47a94c7f0f478b4ee8b0
generated_at: 2026-11-08T08:45:01.679513+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/put-purchase-hold.ts

## Purpose

Thin HTTP controller for `PUT /users/:id/purchase-hold`. It validates the request (ID extraction, body parsing via a Zod schema) and delegates all business logic—including 404 handling, staff-account 403 guard, and audit logging—to `userService.setPurchaseHold`. Exists to keep route-level concerns (serialization, caller context, response shape) separate from domain logic.

## Key elements

- **`putPurchaseHold`** (exported) — Express handler wrapped in `namedHandler('setUserPurchaseHold', …)`. Steps:
  1. `requireId` extracts and validates the `:id` param; aborts with `users.not-found` if missing.
  2. `parseBody` validates the JSON body against `SetUserPurchaseHoldBody` (Zod schema from `@api/schemas.zod`).
  3. Calls `userService.setPurchaseHold(id, { until, note }, callerContext)`.
  4. On success, maps the result through `userService.toUserContract` and sends a **200** with the user contract.
  5. `refused` short-circuits domain-level rejections (e.g. 403); `catchAs` is the top-level error formatter.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies the `namedHandler`, `parseBody`, `refused`, and `catchAs` utilities that shape the handler's control flow and error responses.
- **`src/infrastructure/http/ids.ts`** — supplies `requireId`, which reads and validates the `:id` route param.
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf`, used to extract the authenticated caller (role, ID) passed to the service and to `toUserContract`.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse`, the canonical 200-envelope sender.
- **`src/modules/users/routes.ts`** — registers `putPurchaseHold` on the `PUT /users/:id/purchase-hold` route.
- **`src/modules/users/services/index.ts`** — provides `userService` (specifically `setPurchaseHold` and `toUserContract`), which owns all domain rules and side-effects.

## Notes

- The controller is deliberately stateless: it never checks "is this a staff account?" or writes an audit row—`userService.setPurchaseHold` owns both (see the 403 and audit-line mentioned in the file's doc comment).
- The response status is **200**, not 201, because the operation *replaces* the existing hold rather than creating a new resource.
- `callerContextOf(request)` is invoked twice (once for the service call, once for `toUserContract`). The context object is read-only, so this is safe, but it means the value is resolved from the request each time.
- The handler body is a plain function returning a Promise chain (`.then` / `.catch`) rather than `async/await`, consistent with the `namedHandler` wrapper contract in the infrastructure layer.
