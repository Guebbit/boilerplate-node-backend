---
source: src/modules/users/openapi.yaml
sha256: 52585f7914ea3f95f30b4a7b1c4703dda0c5794828ea4d1c26d2ae12b86c8b89
generated_at: 2026-11-08T08:47:09.771615+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract defining the REST surface of the **users** module: listing, creating, reading, updating, and (implied) deleting user accounts, along with module-specific 409 error codes and a contributed section of the account data export. Serves as the single source of truth for the module's HTTP API shape.

## Key elements
- **`x-error-codes`** (top-level): nine module-specific `409` conflict codes (`USER_NOT_DELETED`, `USER_ERASURE_DUE`, `USER_ALREADY_ACTIVE`, `USER_ALREADY_INACTIVE`, `USER_NOT_WARNED`, `USER_STAFF_NOT_REAPABLE`, `USER_NOT_REAPER_DELETED`, `USER_ERASURE_NOT_DUE`, `USER_PURCHASE_HOLD_NOT_SET`). Several are flagged as *reaper-only* — never returned by a route.
- **`tags`**: single tag `Users` with `x-family: Core`.
- **`x-personal-data`**: declares the `signInMethods` section the bundler injects into `AccountExportResponse` for `POST /account/export`.
- **`GET /users`** (`listUsers`): paginated, filterable list. Supports `sort` (JSON:API grammar), `text`, `id`, `email`, `username`, `active`, `deleted`, `purchaseHold`, `purchaseHoldReview`. Returns `UsersResponse`.
- **`POST /users`** (`createUser`): creates an account; no password in body — owner sets it via emailed link. Accepts `application/json` or `multipart/form-data`. `uploadLimiter` guards the route (429).
- **`GET /users/{id}`** (`getUserById`): full profile; equivalent to `GET /users?id={id}`.
- **`PUT /users/{id}`** (`replaceUserById`): full representation replace (RFC 9110 §9.3.4). Credentials and image excluded from the body.
- **`PATCH /users/{id}`** (`updateUserById`): JSON Merge Patch (RFC 7396). Accepts `application/json` or `application/merge-patch+json`.
- **`x-versioned: [get, put, patch, delete]`** on `/users/{id}`: bundler directive that injects `If-Match` / `ETag` / `412` handling.
- **Components (referenced, defined later in file)**: `UserSort`, `UsersResponse`, `CreateUserRequest`, `CreateUserRequestMultipart`, `ReplaceUserByIdRequest`, `ReplaceUserByIdRequestMultipart`, `UpdateUserByIdRequest`, `ExportSignInMethods`.

## Relationships
- **`shared/contracts/openapi.root.yaml`** — heavily referenced for shared `parameters` (PageParam, PageSizeParam, TextParam, IdParam, IdPathParam), `schemas` (User, Email), `responses` (Unauthorized, Forbidden, ValidationError, Conflict, NotFound, TooManyRequests), and `headers` (Location). This file is the *consumer*; the root file is the shared vocabulary.
- **`src/modules/users/module.ts`** — the runtime module that implements the routes and error codes this contract describes.
- **`src/modules/users/authorization.yaml`** — module-level authorization rules that gate the operations declared here (e.g. `ROLE_MANAGEMENT_REQUIRED` on writes).
- **`src/modules/users/asyncapi.webhooks.yaml`** — event/webhook contract for user lifecycle events (reaper actions, activation, etc.) that complement the synchronous REST surface defined here.

## Notes
- **`x-error-codes` are OpenAPI vendor extensions** (`x-` prefix), not standard. Tooling that ignores extensions will not surface them; they are the canonical list of module 409s.
- **Reaper-only codes** (`USER_NOT_WARNED`, `USER_STAFF_NOT_REAPABLE`, `USER_NOT_REAPER_DELETED`) will never appear as HTTP responses to a client request — they are internal invariants of the purge/reaper pipeline.
- **`purchaseHold` and `purchaseHoldReview` query params** accept only `true` (enum-constrained). There is deliberately no `false` value; "not under hold" is the default (absent) state.
- **`x-cache: private-no-cache`** on read endpoints signals to gateways/CDNs that responses must not be shared-cached, but the instruction is module-local, not enforced by OpenAPI itself.
- **`x-versioned` is a bundler directive**, not an OpenAPI keyword. It tells the build tooling to splice `If-Match` parameters, `ETag` response headers, and `412` responses into the listed operations at contract-composition time.
- **`x-personal-data` is likewise a bundler extension**: removing this module's code removes the corresponding section from the composed `AccountExportResponse` schema.
- The file was truncated at `PATCH /users/{id}`; additional paths (e.g. `DELETE /users/{id}`, activate/deactivate routes) and the full `components/schemas` block follow in the same file.
