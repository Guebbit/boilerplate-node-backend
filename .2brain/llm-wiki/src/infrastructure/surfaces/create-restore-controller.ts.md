---
source: src/infrastructure/surfaces/create-restore-controller.ts
sha256: 810797a29132421e331bcf82ebcf48694a23f028984b21806df4516fab8943ad
generated_at: 2026-10-29T02:17:31.124686+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/surfaces/create-restore-controller.ts

## Purpose

Shared factory that builds the `POST /x/:id/restore` Express handler for any module using soft-delete. Restoring is a separate verb because a retried `DELETE` must remain safe (RFC 9110 §9.2.2) and must never resurrect a record.

## Key elements

- **`RestoreControllerSpec<TRow>`** — interface capturing the three things that differ per entity: the entity name (for log lines), the `restore` service call (returns `ServiceResult<TRow>`; 404 if absent, 409 if not soft-deleted), the `present` projection (same shape the entity's reads use), and the i18n key for not-found.
- **`createRestoreController<TRow>(spec)`** — exported factory. Returns a named Express handler (e.g. `restoreOrder`) that extracts `:id`, calls the service, sends the error envelope on refusal, or projects the restored row and replies 200.

## Relationships

- **`src/infrastructure/http/controller.ts`** — supplies `namedHandler`, `operationName`, `refused`, `catchAs`, and the `ServiceResult` type used throughout.
- **`src/infrastructure/http/ids.ts`** — supplies `requireId` to read and validate the `:id` route param; a malformed id short-circuits with the spec's `notFoundKey`.
- **`src/infrastructure/http/response.ts`** — supplies `successResponse` for the 200 reply.
- **`src/modules/orders/controllers/restore-orders.ts`**, **`src/modules/products/controllers/restore-products.ts`**, **`src/modules/users/controllers/restore-users.ts`** — consumers; each passes an order/product/user-specific `RestoreControllerSpec` to `createRestoreController`.

## Notes

- The `restore` callback receives the raw `Request` so each module can build its own `CallerContext` and write an audit row (rule 1, `docs/theory/module-lifecycle.md`), mirroring how `createUpdateController`'s `update` works.
- `present` must return the same projection the entity's own reads return; a restore must never expose fields a read would hide.
- A malformed `:id` is answered with the not-found i18n key (not a 400), keeping the error surface uniform.
