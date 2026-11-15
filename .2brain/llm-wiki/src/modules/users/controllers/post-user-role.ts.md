---
source: src/modules/users/controllers/post-user-role.ts
sha256: 2329e54b9cd7b306029b3266dd49c1e03f2625a44a4ac88245834932c89c4ac1
generated_at: 2026-11-14T22:21:15.485766+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/controllers/post-user-role.ts

## Purpose

HTTP controllers for the two role-door endpoints (`POST /users/:id/assign-role` and `POST /users/:id/revoke-role`). They extract the target user ID, validate the request body (assign only), delegate the actual permission/audit logic to `userService`, and shape the successful response as a resource with an ETag.

## Key elements

- **`postAssignRole`** (exported) — Handler for assigning (i.e. replacing) a user's role. Parses the `AssignUserRoleBody` Zod schema for the role name, then calls `userService.assignUserRole`.
- **`postRevokeRole`** (exported) — Handler for removing a user's staff role. No body required; calls `userService.revokeUserRole`.
- **`answer`** (module-private) — Shared post-service-callback: if the service returned a refusal it is forwarded as-is; otherwise the result is converted via `userService.toUserContract`, an ETag is set with `answerAsResource`, and a `200` is sent via `successResponse`.
- **`callerContextOf(request)`** — Extracts the authenticated caller identity, passed into both service calls and the contract-shaping step.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Supplies `namedHandler`, `parseBody`, `refused`, and `catchAs`, the four controller-primitive utilities both handlers rely on.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId`, which extracts and 404s on a missing `:id` param.
- **`src/infrastructure/http/preconditions.ts`** — Provides `answerAsResource`, which sets the `ETag` / `Link` headers for the returned resource.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` for pulling the caller identity out of the request.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse` to emit the final 200 JSON body.
- **`src/modules/users/role-routes.ts`** — Wires these two exported handlers onto their respective Express routes.
- **`src/modules/users/services/index.ts`** — Source of `userService`; owns the 404/403/422/409 decisions, audit-row writes, and `toUserContract` shaping.
- **`tests/contract/etag-on-every-answer.test.ts`** — Contract test asserting that every response from these endpoints carries an ETag (the `answerAsResource` call).
- **`tests/contract/ownership-shop.contract.test.ts`** — Contract test exercising the assign/revoke flow end-to-end.

## Notes

- The assign endpoint **replaces** the current role rather than adding one; the docblock explicitly says "replacing the one it holds."
- `postRevokeRole` intentionally skips body parsing — there is no payload to validate.
- The `answer` helper is not exported; both handlers share it via closure within this module.
- Error semantics (404, 403, 422, 409) are fully owned by `userService`; the controller layer only handles the happy-path shaping and the pass-through of service refusals via `refused()`.
