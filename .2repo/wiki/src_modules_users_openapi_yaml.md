# src/modules/users/openapi.yaml

## Purpose

OpenAPI 3.0.3 module contract for the **Users** domain (v2.0.0). Defines the full CRUD surface for user accounts — list, create, read, update, soft-delete, and hard-delete — so that API clients, code generators, and documentation tools can consume a single source of truth for this module's endpoints.

## Key elements

- **`GET /users`** (`listUsers`) — paginated user list with filters for email, username, active, admin, verified, text search, and id. Returns `UsersResponseEnvelope` (defined locally).
- **`POST /users`** (`createUser`) — creates a user; accepts JSON (`CreateUserRequest`) or `multipart/form-data` (`CreateUserRequestMultipart`) for optional image upload.
- **`PUT /users`** (`updateUser`, `x-alias-of: updateUserById`) — edits email/password; same dual content-type support as create.
- **`DELETE /users`** (`deleteUser`, `x-alias-of: deleteUserById`) — deletes by `id` in body; `hardDelete` flag readable from query **or** body (`true` from any source wins).
- **`GET /users/{id}`** (`getUserById`) — single-user lookup by path id.
- **`PUT /users/{id}`** (`updateUserById`) — edit by path id; uses `UpdateUserByIdRequest` / `UpdateUserByIdRequestMultipart`.
- **`DELETE /users/{id}`** (`deleteUserById`) — delete by path id; `hardDelete` as query param or optional body.
- **`DELETE /users/{id}/hard`** — hard-delete spelled in the path; reaches the same handler as `DELETE /users/{id}?hardDelete=true`.
- **Local schemas** (referenced but defined below the truncated section): `UsersResponseEnvelope`, `CreateUserRequest(Multipart)`, `UpdateUserRequest(Multipart)`, `UpdateUserByIdRequest(Multipart)`, `DeleteUserRequest`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — the primary dependency. This file `$ref`s it for reusable parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `IdPathParam`, `HardDeleteParam`), shared schemas (`Email`, `UserEnvelope`, `HardDeleteRequest`), and standard error/success responses (`Unauthorized`, `Forbidden`, `ValidationError`, `NotFound`, `InternalError`, `Success`). All cross-file refs use the relative path `../../../shared/contracts/openapi.root.yaml`.

## Notes

- **Alias pattern:** `PUT /users` and `DELETE /users` are marked `x-alias-of` their `{id}` counterparts. One controller serves both route shapes; the alias extension documents the equivalence for tooling and readers.
- **`hardDelete` resolution:** the flag is intentionally declared on both the query and the body (and the `/hard` path variant). A `true` from *any* source is authoritative; a `false` elsewhere does not override it.
- **Dual content types:** create and update accept both `application/json` and `multipart/form-data`, enabling optional image upload without a separate endpoint.
- **Security:** every operation requires `bearerAuth`.
- Sibling module specs (`products`, `wishlist`) are **not** referenced from this file; they are independent contracts in the same monorepo.
