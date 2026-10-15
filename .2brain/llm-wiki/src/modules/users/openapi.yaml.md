---
source: src/modules/users/openapi.yaml
sha256: 9ac103f795f8f8d5690b12fa1bd3cdada9d49e7bc51b7b37e70592bb0c1c73e9
generated_at: 2026-10-15T12:08:53.011251+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **users** module. It declares the HTTP surface (list, create, delete, fetch, replace, edit, restore users) along with the schemas and query parameters that implement it, so that client code, docs, and the account-data-export bundler all derive from a single source of truth.

## Key elements

- **`tags: [Users]`** — single tag grouping every operation under "Administration of user accounts and their roles."
- **`x-personal-data`** — extension consumed by the account-export bundler; contributes the `signInMethods` section to `POST /account/export`. Removing this key removes the section.
- **`/users` (GET / POST / DELETE)** — list (paginated, filterable by email, username, active, deleted, sort), create (JSON or multipart; no caller-supplied password), and bulk/alias delete (`x-alias-of: deleteUserById`). The `hardDelete` flag is readable from query, params, or body; `true` from any source wins.
- **`/users/{id}` (GET / PUT / PATCH / DELETE)** — per-user CRUD. PUT follows RFC 9110 §9.3.4 (full replace); PATCH follows RFC 7396 (merge-patch). Credentials and image live outside the PUT/PUT representation.
- **`x-versioned: [get, put, patch, delete]`** on `/users/{id}` — bundler adds `If-Match` parameter, `412` response, and `ETag` header to those operations.
- **Local `components/schemas`** (referenced but defined elsewhere in the file or a sibling file): `UserSort`, `UsersResponseEnvelope`, `CreateUserRequest(Multipart)`, `DeleteUserRequest`, `ReplaceUserByIdRequest(Multipart)`, `UpdateUserByIdRequest`, `ExportSignInMethods`.
- **Shared `$ref`s into `openapi.root.yaml`** — `PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `IdPathParam`, `HardDeleteParam`, `Email`, `UserEnvelope`, and all standard error responses (`401`, `403`, `404`, `409`, `412`, `422`, `429`, `500`), the `Location` header, and the `Success` response.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — every shared parameter, reusable response object, header, and cross-cutting schema is pulled in via relative `$ref` (`../../../shared/contracts/openapi.root.yaml#/components/…`). This file contributes module-specific schemas back to the root document.
- **`src/modules/webhooks/module.ts`** — appears in the dependency graph as a consumer/producer of this contract (e.g., webhook payloads or event schemas that mirror the user resource shape defined here).

## Notes

- `DELETE /users` carries `x-alias-of: deleteUserById`; the controller treats both routes identically (`surface: 'delete'` reads params, query, and body regardless of mount point).
- The `deleted` query param on `GET /users` is permission-gated: callers without visibility into soft-deleted rows receive an empty page for `deleted=true` rather than a 403.
- `429` responses reference an `uploadLimiter` middleware that sits in front of the create/replace routes (see `routes.ts` for wiring).
- `409` on create/replace signals an undeclared role or a privilege escalation the caller is not permitted to grant.
- Sort parameter uses JSON:API grammar (`?sort=-field,field`), not a JSON array.
