---
source: src/infrastructure/surfaces/create-restore-controller.ts
sha256: 92614bb0ac107d9a09dec46b51ac07a0746fd5ad146154bbdda2d0453c307b2e
generated_at: 2026-11-14T18:19:28.482223+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-restore-controller.ts

## Purpose

Factory that builds a `POST /x/:id/restore` Express handler for any module whose `DELETE /x/:id` soft-deletes a record. A dedicated verb is required because DELETE must remain idempotent and safe-to-repeat (RFC 9110 §9.2.2); a retried DELETE must never resurrect a row.

## Key elements

- **`RestoreControllerSpec<TRow>`** — interface bundling the four per-entity differences: `entity` (log label), `restore` (service call returning a `ServiceResult<TRow>`; 404/409 handled by the service), `present` (projection matching the entity's own read shape), `notFoundKey` (i18n key for unknown/malformed ids), `basePath` (used to build `Content-Location`).
- **`createRestoreController(spec)`** — takes a spec, returns a named Express handler (e.g. `restoreOrder`). Reads `:id` via `requireId`, delegates to the spec's `restore`, short-circuits on refusal (404/409), projects via `present`, sets `Content-Location` + ETag via `answerAsResource`, and responds `200` via `successResponse`. Errors fall through to `catchAs`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `namedHandler`, `operationName`, `refused`, `catchAs`, and the `ServiceResult` type used throughout the handler.
- **`src/infrastructure/http/ids.ts`** — provides `requireId` to extract and validate `:id` from the route.
- **`src/infrastructure/http/preconditions.ts`** — provides `answerAsResource` to attach the entity's ETag and `Content-Location` before sending the body.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the final `200` reply.
- **`src/modules/orders/controllers/post-order-restore.ts`** — consumer that calls `createRestoreController` with the order entity's spec.
- **`src/modules/products/controllers/post-product-restore.ts`** — consumer that calls `createRestoreController` with the product entity's spec.
- **`src/modules/users/controllers/post-user-restore.ts`** — consumer that calls `createRestoreController` with the user entity's spec.

## Notes

- The `restore` callback receives the raw `Request` so the calling module can construct its own `CallerContext` and the service can write its own audit row — this controller does no auth or audit itself.
- `present` must produce exactly the same shape the entity's read endpoints return; it is a contract, not an arbitrary projection.
- A `409` (row exists but is not soft-deleted) is signalled by the service layer returning a refused `ServiceResult`; this controller simply forwards the error envelope and stops.
- Success is `200`, not `201`, because the operation undoes a prior state rather than creating a new resource.
