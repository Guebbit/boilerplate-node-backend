---
source: src/modules/users/openapi.yaml
sha256: b851bd00f34076b2f5edf3f7c05c85be8f5ae9663016fb9fb13f5b17d44f3e69
generated_at: 2026-10-29T06:13:57.526837+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/openapi.yaml

## Purpose

OpenAPI 3.1.0 contract for the **users** module: it defines every HTTP endpoint for managing user accounts (list, create, read, replace, delete, activate/deactivate/restore), the module-specific 409 error codes, the "Users" tag, and the slice of the account data export that the bundler merges into `AccountExportResponse`.

## Key elements

- **`x-error-codes`** — Nine module-level 409 codes (`USER_NOT_DELETED`, `USER_ERASURE_DUE`, `USER_ALREADY_ACTIVE`, `USER_ALREADY_INACTIVE`, `USER_NOT_WARNED`, `USER_STAFF_NOT_REAPABLE`, `USER_NOT_REAPER_DELETED`, `USER_ERASURE_NOT_DUE`, `USER_PURCHASE_HOLD_NOT_SET`). Several are raised only by the inactivity reaper, never by a route.
- **`x-personal-data`** — Declares the `signInMethods` section that the bundler injects into the global `AccountExportResponse` schema. Removing the module removes this section.
- **`paths./users` (GET)** — Paginated user list. Filters: `sort` (JSON:API grammar), `email`, `username`, `active`, `deleted`, `purchaseHold` (true-only), `purchaseHoldReview` (true-only).
- **`paths./users` (POST)** — Create a user. Sends a "choose your password" email; the caller never sets another person's password. Accepts `application/json` or `multipart/form-data` (image upload).
- **`paths./users` (DELETE)** — Delete by `id` in the body. `hardDelete` readable from query *or* body; a `true` from any source wins. Marked `x-alias-of: deleteUserById`.
- **`paths./users/{id}`** — `GET` (details), `PUT` (RFC 9110 §9.3.4 full replace; `email`, `password`, and image are outside the representation), `PATCH`, `DELETE`. Annotated with `x-versioned: [get, put, patch, delete]` so the bundler adds `If-Match`/`412`/`ETag`.
- **`tags`** — Single "Users" tag for grouping operations in generated docs.

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Referenced via `$ref` throughout for shared parameters (`PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `IdPathParam`, `HardDeleteParam`), the `User` and `Email` schemas, standard error responses (401, 403, 404, 409, 422, 429), and the `Location` header. This file is a *module* spec that composes on top of that root.
- **`src/modules/webhooks/module.ts`** — Listed as a graph neighbor; the users module's lifecycle events (deactivation, erasure, restore) are the domain that the webhooks module subscribes to and dispatches outbound events for.

## Notes

- **`x-versioned`, `x-personal-data`, `x-alias-of`** are non-standard OpenAPI extensions consumed by an internal bundler, not by generic OpenAPI tooling.
- `purchaseHold` and `purchaseHoldReview` are `enum: [true]` — there is deliberately no `false` value; a lifted or expired hold is not a queryable state.
- `DELETE /users` and `DELETE /users/{id}` share a single controller; the `id` comes from the body on the collection route and from the path on the item route. The `hardDelete` flag is "declared rather than merely tolerated" on both.
- `PUT /users/{id}` follows RFC 9110 full-replacement semantics: an omitted optional field is cleared, but `email`, `password`, and the image are explicitly outside the representation (managed via `/account` or upload endpoints).
- The `sort` query parameter uses JSON:API style (`-` prefix for descending, comma-separated) rather than a custom scheme.
