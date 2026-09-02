# src/modules/users/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract for the Users module (v2.0.0). It defines the REST endpoints for listing, creating, reading, updating, and deleting user accounts, and serves as the machine-readable API specification consumed by codegen, tooling, and documentation pipelines.

## Key elements

- **`/users` (GET)** – Paginated user list with filters (email, username, active, admin, verified). Returns `UsersResponseEnvelope`.
- **`/users` (POST)** – Create a user. Accepts `application/json` (`CreateUserRequest`) or `multipart/form-data` (`CreateUserRequestMultipart` for image upload). Supports optional `sendSetupEmail` flow.
- **`/users` (PUT)** – Edit user (email/password). Marked `x-alias-of: updateUserById`. Accepts JSON or multipart.
- **`/users` (DELETE)** – Delete user by `id` in body. `hardDelete` flag readable from both query and body; a `true` from any source wins. Marked `x-alias-of: deleteUserById`.
- **`/users/{id}` (GET / PUT / DELETE)** – Id-in-path variants of the operations above. Functionally equivalent to their `/users` counterparts.
- **`/users/{id}/hard` (DELETE)** – Hard-delete expressed in the path rather than via a query flag. Reaches the same handler as `DELETE /users/{id}?hardDelete=true`.
- **Local schemas** – `UsersResponseEnvelope`, `CreateUserRequest`, `CreateUserRequestMultipart`, `UpdateUserRequest`, `UpdateUserRequestMultipart`, `UpdateUserByIdRequest`, `UpdateUserByIdRequestMultipart`, `DeleteUserRequest` (defined under `#/components/schemas`, truncated in this view).
- **Security** – All operations require `bearerAuth`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** – Primary dependency. Reuses shared parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `IdPathParam`, `HardDeleteParam`), the `Email` schema, the `UserEnvelope` response schema, the `HardDeleteRequest` schema, and all standard error responses (`Unauthorized`, `Forbidden`, `ValidationError`, `NotFound`, `InternalError`, `Success`).
- **`src/modules/products/openapi.yaml`** / **`src/modules/wishlist/openapi.yaml`** – Sibling module contracts that share the same `shared/contracts/openapi.root.yaml` base; no direct `$ref` between them is present in this file.

## Notes

- `PUT /users` and `DELETE /users` carry an `x-alias-of` extension pointing to their `/users/{id}` counterparts, indicating a single backend controller serves both route shapes.
- `hardDelete` is deliberately declared in the query parameters of `DELETE /users` (not just tolerated) so that one controller can read it from params, query, or body regardless of which route it is mounted on.
- The `x-alias-of` extension is a custom OpenAPI extension (not standard); tooling that ignores unknown `x-` extensions will still parse the spec correctly but won't recognize the aliasing relationship.
- Multipart variants exist for create and update to support optional image uploads; the JSON and multipart schemas are separate components rather than one schema with a file field.
