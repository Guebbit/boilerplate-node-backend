---
source: src/modules/users/controllers/post-user-activation.ts
sha256: 37f7416ecb3f87624922dd13cbc29a7a6df987e3a5766a88e888ec59f4da60cd
generated_at: 2026-11-08T08:44:29.230444+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/post-user-activation.ts

## Purpose

Thin HTTP controller for `POST /users/:id/activate` and `POST /users/:id/deactivate`. It extracts the user id, builds caller context, delegates the actual state change to `userService`, and shapes the JSON response. All business rules (404, 403 for staff, 409 on repeat, audit logging) are owned by the service layer, not here.

## Key elements

- **`switchHandler(name, move)`** – Internal factory that returns a `namedHandler`. It resolves `:id` via `requireId`, builds a caller context via `callerContextOf`, calls the supplied service method, maps a success through `userService.toUserContract`, short-circuits on `refused`, and funnels errors into `catchAs`.
- **`postActivate`** – Exported handler for `POST /users/:id/activate`; wraps `switchHandler` with `userService.activate`.
- **`postDeactivate`** – Exported handler for `POST /users/:id/deactivate`; wraps `switchHandler` with `userService.deactivate`.

## Relationships

- **`@infrastructure/http/controller`** – Provides `namedHandler` (wraps the async function with logging/error shape), `refused` (checks whether the service result is a refusal and writes the error response), and `catchAs` (final `.catch` that serializes unexpected errors).
- **`@infrastructure/http/ids`** – `requireId` validates and extracts the `:id` param; returns `null` and sends 404 if absent.
- **`@infrastructure/http/request`** – `callerContextOf` pulls the authenticated caller's identity/role from the request for downstream authorization and audit.
- **`@infrastructure/http/response`** – `successResponse` sends the 200 JSON body.
- **`src/modules/users/routes.ts`** – Registers `postActivate` / `postDeactivate` on the router for the respective paths.
- **`src/modules/users/services`** – `userService.activate` / `userService.deactivate` perform the state transition and return a discriminated result (success data vs. refusal); `userService.toUserContract` maps the internal entity to the public user shape.

## Notes

- The controller contains **no business logic**. If you're debugging a 403 or 409, go to `userService`, not here.
- `requireId` failure causes an early `Promise.resolve()` (i.e., the handler ends after the 404 is written). No further service call is made.
- `refused(response, result)` is the mechanism by which service-level rejections (403/409) are surfaced without throwing; if it returns `true`, the handler stops and no 200 is sent.
- Both operations share one code path via the `switchHandler` factory; the only differences are the `operationId` string and which service method is called.
