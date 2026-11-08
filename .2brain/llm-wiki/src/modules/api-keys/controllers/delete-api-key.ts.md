---
source: src/modules/api-keys/controllers/delete-api-key.ts
sha256: c4c38cfe99f53bc65a2fc6f430391aff9929c33af8dd8b8575bcf6c984e99ae5
generated_at: 2026-11-08T05:01:34.494538+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/controllers/delete-api-key.ts

## Purpose

Handles the `DELETE /api-keys/:id` endpoint, which revokes an API key (a soft state change) rather than deleting it. It is hand-written instead of using the `createDeleteController` factory because revocation has no hard-delete counterpart and does not fit the soft/hard delete triplet pattern.

## Key elements

- **`revokeApiKey`** (exported) — Express handler for `DELETE /api-keys/:id`. Validates the `:id` param, calls the service to revoke, and responds `204 No Content` on success. Idempotent: revoking an already-revoked key still yields `204`.
- **`requireId`** (imported from `ids`) — Extracts and validates the route `:id`; a malformed id short-circuits to a generic `404` (`generic.error-item-gone`) before any database access.
- **`refused`** (imported from `controller`) — Checks the service result for a refusal; if present, writes the appropriate error response and stops the chain.
- **`catchAs`** (imported from `controller`) — Wraps the promise `.catch` to map thrown errors to a structured HTTP response, scoped under the `'revokeApiKey'` label.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Provides the `refused` and `catchAs` response helpers used throughout the handler.
- **`src/infrastructure/http/ids.ts`** — Provides `requireId` for parsing and validating the `:id` param.
- **`src/infrastructure/http/request.ts`** — Provides `tenantCallerContextOf` to derive the tenant/caller context passed into the service call.
- **`src/infrastructure/http/response.ts`** — Provides `noContentResponse` (the `204` reply).
- **`src/modules/api-keys/routes.ts`** — Registers `revokeApiKey` as the handler for the `DELETE /api-keys/:id` route.
- **`src/modules/api-keys/services/index.ts`** — Exports `apiKeysService`, whose `revokeApiKey(id, callerContext)` method performs the actual state transition.

## Notes

- Despite the filename containing "delete," this endpoint does **not** delete a key; it revokes it. The file's own doc comment calls this out explicitly.
- The `204` response carries no body, so the caller cannot distinguish "just revoked" from "was already revoked" — the operation is intentionally idempotent.
- The handler is a plain `(request, response) => void` function (not an async wrapper), relying on the returned promise from the service chain for `.then`/`.catch` sequencing.
