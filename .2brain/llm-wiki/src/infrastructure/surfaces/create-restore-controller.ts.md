---
source: src/infrastructure/surfaces/create-restore-controller.ts
source_sha256: ba181f850a65f39bdb9467b8492aa12ef2ef0bba23c9ce193a3afd6fe5afcde5
context_sha256: dd13f48d57a2e0469881376fcb21556025ecaa0a73c9ae99b93e47f596517065
generated_at: 2026-11-22T03:10:52.879555+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/surfaces/create-restore-controller.ts

## Purpose
A factory for the `POST /x/:id/restore` controller shared by every module whose `DELETE /x/:id` soft-deletes. Restore is a separate verb because DELETE must stay safe to repeat (RFC 9110 §9.2.2), so a retried DELETE can never bring a record back.

## Key elements
- **`RestoreControllerSpec<TRow>`**: the per-entity configuration:
  - `entity`: lower-case singular name, used to name the operation and log line.
  - `restore(id, request)`: the service call. It returns a `ServiceResult<TRow>`: 404 when absent, 409 when not soft-deleted, the restored row otherwise. It receives the raw `request` so the module can build its own `CallerContext`. The service records its own audit row.
  - `present(row, request)`: projects the restored row into the entity's contract shape, the same one its reads use. It may return a value or a promise.
  - `notFoundKey`: i18n key answered when the id matches nothing or is not a valid id.
  - `basePath`: collection path (e.g. `'/orders'`). `<basePath>/<id>` becomes the `Content-Location`.
- **`createRestoreController(spec)`**: returns an express handler wrapped by `namedHandler` and named via `operationName('restore', entity)`, e.g. `restoreOrder`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `namedHandler`, `operationName`, `refused`, `catchAs` and the `ServiceResult` type.
- `src/infrastructure/http/ids.ts`: `requireId` reads `:id` from the route. A malformed id is answered with `notFoundKey`.
- `src/infrastructure/http/preconditions.ts`: `answerAsResource` sets the restored row's tag and `Content-Location`.
- `src/infrastructure/http/response.ts`: `successResponse` sends the 200 body.
- `src/modules/orders/controllers/post-order-restore.ts`, `src/modules/products/controllers/post-product-restore.ts`, `src/modules/users/controllers/post-user-restore.ts`: module controllers that call this factory with their own spec.

## Notes
- Request flow: `requireId`, then `restore`, then `refused` (sends the error envelope and stops), then `present`, then `answerAsResource`, then `successResponse(…, 200)`. Any rejection goes to `catchAs`.
- `answerAsResource` is called on the shaped (presented) row, not the raw row.
- The `request` is passed through to both `restore` and `present`, so audit context and presentation can depend on the caller.
