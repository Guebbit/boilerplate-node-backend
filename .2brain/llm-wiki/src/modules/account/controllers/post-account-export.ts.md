---
source: src/modules/account/controllers/post-account-export.ts
source_sha256: f891b9037b461a274cf4fb0e3b041c40da59f06457a16f7b6a2f2a3bc7542a71
context_sha256: 665989fd5ac6a1e2bbc304c4265423acb80492e23799f332971164662c5c9c05
generated_at: 2026-11-22T03:23:49.525232+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-account-export.ts

## Purpose
Express controller for `POST /account/export`. It is a thin HTTP adapter that lets an authenticated caller request an export of their own data. It delegates to `requestExport` and replies `202 Accepted` while the file is built in the background. A link to the finished file is mailed when it is ready.

## Key elements
- **`postAccountExport(request, response)`** (exported): the route handler.
  - Reads `id` from `request.authContext!`, which the auth middleware guarantees is set.
  - Calls `requestExport(id, callerContextOf(request))`.
  - If `refused(response, result)` handles the result, it returns without doing anything else.
  - Otherwise it sets `Location: /account/export` and sends `successResponse(response, result.data, result.status)`.
  - Rejections go to `catchAs(response, 'postAccountExport')`.

## Relationships
- **`../services/export`**: provides `requestExport`, which holds the actual logic. It is imported directly rather than through `accountService` because the data-export service is deliberately kept out of that barrel.
- **`@infrastructure/http/controller`**: provides `catchAs`, the error handler used in `.catch`, and `refused`, which writes a refusal response if the service result is a refusal.
- **`@infrastructure/http/request`**: provides `callerContextOf`, which builds the caller context passed to the service.
- **`@infrastructure/http/response`**: provides `successResponse`, which formats the success reply.
- **`src/modules/account/routes.ts`**: mounts this handler on the route, together with the `requireFreshAuth` middleware.

## Notes
- `requireFreshAuth`, mounted on the route, is the only identity proof. The controller does no further checks.
- `Location` points at `/account/export`, which is the status monitor the client should poll (RFC 9110 §15.3.3). Express's `response.location` only sets the header and does not follow it.
- The handler returns the promise chain rather than being `async`.
