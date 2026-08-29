# src/modules/users/controllers/write-users.ts

## Purpose

Single controller handler that unifies user creation and editing behind one function. Dispatches on the presence of an `id` (from path param or body) and the HTTP method: no id + POST creates a user; id present updates one; PUT without id returns 422. Exists so the three admin write routes (`POST /users`, `PUT /users`, `PUT /users/:id`) share one validation, upload-cleanup, and error-handling code path.

## Key elements

- **`writeUsers`** (exported) — The only export. Accepts an Express `Request`/`Response`; performs input extraction, optional image-upload resolution, schema validation, then either `userService.create` or `userService.updateById`. Returns a 201 on create, 200 on update, or 422/500 on failure.
- **`readInput(request, …)`** call — Extracts `id`, `admin`, `active` in one pass. `booleans` are listed because multipart bodies cannot carry native booleans.
- **`resolveImageUrl(request)` / `imageStore.remove`** — Handles the uploaded-avatar branch. `deleteUpload` is a closure that removes only the file *this* request wrote (`imageUrlFile`), never a URL supplied in the body.
- **`userService.validateData`** — Pre-flight validation; a non-empty error list short-circuits to a 422.
- **`successResponse` / `rejectResponse` / `rejectDatabaseError`** — Standardised HTTP reply helpers used for all exit paths.
- **`t('generic.error-missing-data')`** — i18n lookup for the "missing id on PUT" case.

## Relationships

- **`src/modules/users/service.ts`** — `userService.create` and `userService.updateById` are the only domain operations invoked; `userService.validateData` gates both branches.
- **`src/infrastructure/http/request.ts`** — `readInput` and `callerContextOf` extract typed fields and audit context from the raw Express request.
- **`src/infrastructure/http/response.ts`** — `successResponse` and `rejectResponse` shape every HTTP reply.
- **`src/infrastructure/http/errors.ts`** — `rejectDatabaseError` maps thrown errors to a consistent 5xx payload.
- **`src/infrastructure/http/uploads.ts`** — `resolveImageUrl` pulls the stored path of a multipart image upload out of the request.
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore.remove` deletes an orphaned upload when validation or persistence fails.
- **`src/infrastructure/i18n/index.ts`** — `t` translates error messages before they are sent to the client.
- **`src/types/index.ts`** — `CreateUserRequest`, `UpdateUserRequest`, `User`, and their multipart variants type the request body union.
- **`src/modules/users/routes.ts`** — Binds `writeUsers` to the three write routes (the controller's sole consumer).

## Notes

- **Upload-cleanup scope:** `deleteUpload` always removes `imageUrlFile` (the file written *by this request*). It never deletes a URL that arrived in the JSON body — that URL may reference an image owned by another entity.
- **Catch on `deleteUpload`:** In the validation-failure path the `.catch(() => undefined)` swallows storage errors so a 422 is never upgraded to a 500.
- **Type assertion after validation:** `const validated = … as Pick<User, …>` is a deliberate narrowing step — the comment notes it records what `validateData` already established rather than assuming it.
- **Service-parameter naming:** The create branch casts the body to `Parameters<typeof userService.create>[0]` rather than a model type, so the controller tracks the service's contract instead of the persistence shape.
- **PUT without id:** Explicitly rejected with 422 *after* the generic validation guard, so a malformed body still surfaces field-level errors first.
