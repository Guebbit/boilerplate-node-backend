---
source: src/modules/users/openapi.yaml
sha256: 5a891abd9d2e145091d7d82541adb5ae4b39e03fa5727ba66cdb9c770a0f44c1
generated_at: 2026-09-27T15:38:21.669685+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract (v2.0.0) that defines the full REST surface for the **users** module: list, create, delete, get-by-id, full-replace, and partial-update operations. It serves as the single source of truth for the module's request/response shapes, parameter semantics, and error responses, and is the document other tooling (codegen, client SDKs, docs) consumes.

## Key elements

- **`GET /users`** (`listUsers`) — paginated user listing with filter params (`email`, `username`, `active`, `deleted`). Returns `UsersResponseEnvelope` (local component).
- **`POST /users`** (`createUser`) — creates a user; accepts `application/json` or `multipart/form-data` (for optional image upload). `password` is optional when `sendSetupEmail` is used. 409 signals an undeclared role or privilege-escalation denial; 429 is emitted by the `uploadLimiter` middleware.
- **`DELETE /users`** (`deleteUser`) — body-carrying delete. `hardDelete` flag readable from query *or* body; a `true` from any source wins. Soft delete is one-way; undo via `POST /users/{id}/restore`. Carries `x-alias-of: deleteUserById`.
- **`GET /users/{id}`** (`getUserById`) — equivalent to `GET /users?id={id}`.
- **`PUT /users/{id}`** (`replaceUserById`) — full replace per RFC 9110 §9.3.4 (omitted optional fields are cleared). `password` is exempt from clearing. Supports multipart for image.
- **`PATCH /users/{id}`** (`updateUserById`) — merge per RFC 7396 (omitted fields unchanged, `null` clears). Supports multipart for image.
- **`DELETE /users/{id}`** — path-param variant of `DELETE /users` (truncated in this listing; `x-alias-of` links the two).
- **Local `components/schemas`** — `UsersResponseEnvelope`, `CreateUserRequest`, `CreateUserRequestMultipart`, `DeleteUserRequest`, `ReplaceUserByIdRequest`, `ReplaceUserByIdRequestMultipart`, `UpdateUserByIdRequest`, `UpdateUserByIdRequestMultipart`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — every shared parameter (`PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `IdPathParam`, `HardDeleteParam`), common schema (`Email`, `UserEnvelope`), and standard error/success responses (`Unauthorized`, `Forbidden`, `ValidationError`, `InternalError`, `Success`, `NotFound`, `Conflict`, `TooManyRequests`) are pulled in via `$ref`. This file is the *consumer*; the root contract is the *provider*.
- **`src/modules/webhooks/module.ts`** — listed as a graph neighbor. No direct `$ref` or import visible in this file; the relationship is at the module-registry level (both live under `src/modules/`).

## Notes

- **PUT vs PATCH semantics differ intentionally.** PUT is a full replace (RFC 9110); PATCH is a merge (RFC 7396). Don't treat them as interchangeable when writing client code or tests.
- **`password` is special-cased** on PUT/PATCH: it is never cleared by omission and has its own flow (`sendSetupEmail`). Omitting it leaves it unchanged.
- **`hardDelete` is "any-true-wins."** A `true` in the query, a `true` in the body, or both — the result is a hard delete. A `false` in one location does *not* cancel a `true` in the other.
- **`x-alias-of` extension** on `DELETE /users` links it to `deleteUserById`; the two routes share one controller (`surface: 'delete'` reads params, query, and body whichever route it's mounted on).
- **`uploadLimiter`** is a route-level middleware (referenced in comments, lives in `routes.ts`) that produces the 429 responses on upload-accepting routes. It is not declared in this OpenAPI spec's `security` or `x-` fields.
- **Multipart variants** exist alongside JSON for every mutation that can carry an image. The `*Multipart` schemas are distinct components; they are not simply the JSON schema with an `image` field added.
