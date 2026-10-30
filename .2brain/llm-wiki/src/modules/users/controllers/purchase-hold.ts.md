---
source: src/modules/users/controllers/purchase-hold.ts
sha256: 928f508624f348560660e04bc9a440601ab31e0fd27e06621f67f7b9087c9774
generated_at: 2026-10-29T06:11:47.175075+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/purchase-hold.ts

## Purpose

Thin HTTP controllers for two staff-facing endpoints: **PUT** `/users/:id/purchase-hold` (set or replace a manual checkout hold on an account) and **DELETE** `/users/:id/purchase-hold` (lift the hold and restart the cancellation count). All business rules — existence checks, staff-account 403s, audit logging — live in the service layer; these handlers only wire request → service → response.

## Key elements

- **`putPurchaseHold`** — `PUT` handler. Extracts the user ID, Zod-parses the JSON body against `SetUserPurchaseHoldBody` (expects `until` ISO string and optional `note`), calls `userService.setPurchaseHold`, then maps the result through `toUserContract` and returns 200.
- **`deletePurchaseHold`** — `DELETE` handler. No body. Calls `userService.liftPurchaseHold`, maps through `toUserContract`, returns 200.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/infrastructure/http/controller.ts` | Source of `namedHandler`, `parseBody`, `refused`, `catchAs` — the shared handler scaffolding both exports use. |
| `src/infrastructure/http/ids.ts` | `requireId` extracts and validates the `:id` param; returns early (404) on failure. |
| `src/infrastructure/http/request.ts` | `callerContextOf` pulls the authenticated caller context, passed to the service and to `toUserContract`. |
| `src/infrastructure/http/response.ts` | `successResponse` serialises the 200 JSON body. |
| `src/modules/users/routes.ts` | Wires `putPurchaseHold` / `deletePurchaseHold` to their respective HTTP verbs and path. |
| `src/modules/users/services/index.ts` | Provides `userService.setPurchaseHold`, `userService.liftPurchaseHold`, and `userService.toUserContract` — the actual domain logic. |

## Notes

- Both handlers return **200 with the full user contract** (not 204) even on `DELETE`, so clients get the updated account state in one call.
- `callerContextOf(request)` is invoked **twice** per handler (once for the service call, once for `toUserContract`). It's a pure getter so this is safe, but it's a mild code-smell if it ever becomes expensive.
- The service is the single owner of 404 / 403 / audit behaviour; the controllers never check for those conditions themselves. A `refused` result short-circuits before `toUserContract` is called.
- The `until` value arrives as a Zod-validated string and is converted with `new Date(body.until)` at the controller boundary — the service receives a `Date` object, not a string.
