---
source: src/modules/users/openapi.yaml
sha256: 898558df5581858df03283f2dda110ff33b8e6eef2d25b324f8efc78aeea4e89
generated_at: 2026-09-23T19:33:39.777485+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/openapi.yaml

## Purpose

OpenAPI 3.0.3 contract (v2.0.0) defining the REST endpoints for the **users** module. It specifies the request/response shapes, authentication, and error semantics for every user-facing route so that clients, tests, and documentation can be generated or validated against a single source of truth.

## Key elements

- **`/users` (GET / POST / PUT / DELETE)** — Collection-level routes for listing, creating, editing, and deleting users. All require `bearerAuth`.
- **`/users/{id}` (GET / PUT / DELETE)** — Item-level routes; functionally equivalent to the collection forms (noted via `x-alias-of` and inline comments).
- **Multipart support** — `POST /users` and both `PUT` routes accept `multipart/form-data` alongside `application/json` for optional image uploads.
- **`hardDelete` parameter** — Acceptable as query param _or_ body field on DELETE; a `true` from any source wins.
- **Rate-limiting (429)** — Declared on the two upload-capable routes; enforced by an `uploadLimiter` middleware (see `routes.ts`).
- **Local schemas** — `UsersResponseEnvelope`, `CreateUserRequest`, `UpdateUserRequest`, `DeleteUserRequest`, and their `*Multipart` / `*ById` variants defined under `#/components/schemas`.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Primary dependency. Nearly every error response (`401`, `403`, `404`, `422`, `429`, `500`), common parameter (`PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `IdPathParam`, `HardDeleteParam`), and shared schema (`UserEnvelope`, `Email`, `HardDeleteRequest`) is pulled in via `$ref`. Keeping these in the shared contract prevents duplication across module specs.
- **`src/modules/webhooks/module.ts`** — Graph-adjacent module in the same codebase; no direct reference is visible in this spec (interaction, if any, is indirect via the shared runtime).

## Notes

- `x-alias-of` is a non-standard extension linking the collection-level `PUT /users` → `updateUserById` and `DELETE /users` → `deleteUserById`. Tooling that only reads `operationId` will see four distinct operations; the alias clarifies they share one controller.
- The `hardDelete` flag is deliberately over-ridable: any `true` wins regardless of source (query vs. body). The `{id}` form marks `requestBody` as optional because the flag can arrive purely via query.
- File paths for `$ref` are relative (`../../../shared/...`); if the file is relocated, every reference breaks silently in some OpenAPI tooling.
- The truncated portion of the file (beyond `DELETE /users/{id}`) may contain additional paths or component definitions not captured here.
