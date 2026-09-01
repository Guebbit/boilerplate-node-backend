# src/modules/users/openapi.yaml

## Purpose
OpenAPI 3.0.3 contract defining the HTTP surface of the **users** module (v2.0.0). It declares the CRUD endpoints for user accounts — list, create, read, update, delete — including a "hard delete" variant, and serves as the single source of truth for API documentation and client code generation for this module.

## Key elements
- **GET /users** (`listUsers`) — paginated, filterable user list (by email, username, active, admin, verified, text search).
- **POST /users** (`createUser`) — create a user; accepts `application/json` *or* `multipart/form-data` (for optional image upload); `sendSetupEmail` controls whether a password is deferred.
- **PUT /users** (`updateUser`) — update email/password; marked `x-alias-of: updateUserById`.
- **DELETE /users** (`deleteUser`) — delete by `id` in body; `hardDelete` flag readable from query *or* body; marked `x-alias-of: deleteUserById`.
- **GET /users/{id}** (`getUserById`) — single-user detail.
- **PUT /users/{id}** (`updateUserById`) — update by path id; supports multipart.
- **DELETE /users/{id}** (`deleteUserById`) — delete by path id; `hardDelete` as query param or optional body.
- **DELETE /users/{id}/hard** — path-level hard-delete shorthand (truncated in source).
- **Local component schemas** — `UsersResponseEnvelope`, `CreateUserRequest`, `CreateUserRequestMultipart`, `UpdateUserRequest`, `UpdateUserRequestMultipart`, `UpdateUserByIdRequest`, `UpdateUserByIdRequestMultipart`, `DeleteUserRequest` (referenced but defined later in the file).

## Relationships
- **shared/contracts/openapi.root.yaml** — heavy `$ref` dependency. Reuses shared parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `IdPathParam`, `HardDeleteParam`), response objects (`Unauthorized`, `Forbidden`, `ValidationError`, `InternalError`, `NotFound`, `Success`), and schemas (`Email`, `UserEnvelope`, `HardDeleteRequest`).
- **src/modules/products/openapi.yaml / src/modules/wishlist/openapi.yaml** — sibling module contracts under the same `src/modules/` directory structure. No `$ref` or direct dependency is present in this file; they coexist as independent module specs.

## Notes
- **Alias pairs:** `updateUser` / `updateUserById` and `deleteUser` / `deleteUserById` are backed by the same controller. The `x-alias-of` extension documents the pairing; the `{id}`-path form is treated as canonical.
- **`hardDelete` flag precedence:** a `true` value from *any* source (query, body, or path `/hard`) wins over a `false` elsewhere — it is an OR, not an override.
- **Multipart vs JSON:** create and update endpoints accept both content types; the multipart variant exists solely to allow an optional image upload alongside the same fields.
- **Security:** every operation requires `bearerAuth`; no public/unauthenticated routes are defined.
- All response error codes (`401`, `403`, `422`, `500`, and where applicable `404`) are `$ref`'d from the shared root rather than defined locally, keeping error semantics consistent across modules.
