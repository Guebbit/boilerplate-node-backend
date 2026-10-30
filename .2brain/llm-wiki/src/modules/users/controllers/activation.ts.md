---
source: src/modules/users/controllers/activation.ts
sha256: 37f7416ecb3f87624922dd13cbc29a7a6df987e3a5766a88e888ec59f4da60cd
generated_at: 2026-10-29T06:11:01.369110+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/activation.ts

## Purpose

HTTP controller for `POST /users/:id/activate` and `POST /users/:id/deactivate`. It extracts the user id and caller context from the request, delegates the actual state change (validation, audit, session teardown) to `userService`, and serialises the resulting user into the response. All business rules (404, 403 for staff, 409 on repeat, audit logging) live in the service layer.

## Key elements

- **`switchHandler(name, move)`** — shared factory that produces the handler for both endpoints. It calls `requireId` to pull `:id` off the URL, `callerContextOf` for auth context, invokes `move(id, context)`, checks `refused`, then maps through `userService.toUserContract` and returns a `200` with the user object. Errors are funnelled through `catchAs`.
- **`postActivate`** — exported handler for `POST /users/:id/activate`; binds `switchHandler` to `userService.activate`.
- **`postDeactivate`** — exported handler for `POST /users/:id/deactivate`; binds `switchHandler` to `userService.deactivate`.

## Relationships

- **`src/modules/users/routes.ts`** — registers `postActivate` / `postDeactivate` on the `POST /users/:id/activate` and `POST /users/:id/deactivate` routes.
- **`src/modules/users/services/index.ts`** — the sole business-logic dependency; `switchHandler` calls `userService.activate`, `userService.deactivate`, and `userService.toUserContract`.
- **`src/infrastructure/http/controller.ts`** — supplies `namedHandler`, `refused`, and `catchAs` used for handler wiring and error handling.
- **`src/infrastructure/http/ids.ts`** — supplies `requireId` for extracting and validating the `:id` param (returns `null` + sends 404 if missing/invalid).
- **`src/infrastructure/http/request.ts`** — supplies `callerContextOf` to build the caller context passed into the service.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the final 200 JSON reply.

## Notes

- The two endpoints are structurally identical except for the service method they call; adding a third "switch" endpoint is just another `switchHandler(name, (id, ctx) => userService.…)` line.
- `refused(response, result)` is the contract for service-level rejections (403/409): the service has already written the error response, so the handler short-circuits without further work.
- The module doc-comment points to `docs/modules/users.md#activating-and-deactivating` for the full behavioural spec.
