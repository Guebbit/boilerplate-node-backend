---
source: src/infrastructure/surfaces/create-restore-controller.ts
sha256: 810797a29132421e331bcf82ebcf48694a23f028984b21806df4516fab8943ad
generated_at: 2026-11-08T03:51:09.891773+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-restore-controller.ts

## Purpose

Shared factory that produces the Express route handler for a module's `POST /x/:id/restore` endpoint — the operation that undoes a soft-delete. It exists as a separate verb because `DELETE` must remain safe to repeat (RFC 9110 §9.2.2); a retried `DELETE` must never resurrect a record.

## Key elements

- **`RestoreControllerSpec<TRow>`** — the per-entity configuration object a module supplies:
  - `entity` — lower-case singular name (e.g. `'order'`); used in log lines and the handler name.
  - `restore(id, request)` — the module's service call. Returns 404 if absent, 409 if not soft-deleted, or the restored row. Receives the raw `Request` so the module can build its own `CallerContext` and the service can record its own audit row.
  - `present(row, request)` — projects the restored row into the entity's public contract shape (must match what the entity's reads return).
  - `notFoundKey` — i18n key for a missing or malformed `:id`.
- **`createRestoreController<TRow>(spec)`** — the exported factory. Returns a named Express handler (named `restore{Entity}`, e.g. `restoreOrder`) that: extracts `:id` via `requireId`, calls `restore`, checks for refusal (404/409), shapes the row via `present`, and responds 200 with `successResponse`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — provides `catchAs`, `namedHandler`, `operationName`, `refused`, and the `ServiceResult` type used throughout the handler flow.
- **`src/infrastructure/http/ids.ts`** — provides `requireId`, which extracts and validates the `:id` route param.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the 200 reply.
- **`src/modules/orders/controllers/post-order-restore.ts`**, **`src/modules/products/controllers/post-product-restore.ts`**, **`src/modules/users/controllers/post-user-restore.ts`** — module-level consumers that each call `createRestoreController` with their own spec (entity name, service `restore`, `present` projection, i18n key) to register their `POST …/restore` route.

## Notes

- A malformed `:id` (non-string, empty, etc.) is answered identically to a genuinely missing record — both use `notFoundKey`. The handler does not distinguish the two cases.
- `present` must produce the same projection the entity's reads answer with; the contract is that restore never exposes fields a normal read would hide.
- The `restore` service call is responsible for its own audit row (rule 1, `docs/theory/module-lifecycle.md`), mirroring how `createUpdateController`'s `update` works.
- The handler name is derived at call time via `operationName('restore', entity)`; it is not a fixed string.
