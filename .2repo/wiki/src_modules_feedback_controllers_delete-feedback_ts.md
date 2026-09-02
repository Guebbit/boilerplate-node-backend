# src/modules/feedback/controllers/delete-feedback.ts

## Purpose

Express handler for `DELETE /feedback/:id` (admin-only, permanent deletion of a feedback ticket). It is hand-written rather than produced by the shared `createDeleteController` factory because the feedback module has no soft-delete tier, so the triplet abstraction would be misleading.

## Key elements

- **`deleteFeedback`** *(exported)* — The sole route handler. Calls `feedbackRequestService.remove(id, callerContext)` and maps the result/error to an HTTP response.
- **Authorization check** — `refused(response, result)` short-circuits with the refusal status when the caller lacks permission.
- **CastError branch** — A Mongoose `CastError` with `kind === 'ObjectId'` is answered as **404** with an i18n "not found" message, mirroring `createDeleteController`'s own CastError handling.
- **Fallback DB-error branch** — All other errors are delegated to `rejectDatabaseError(response, 'deleteFeedback', error)`.

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides `successResponse` (200 on success) and `rejectResponse` (404 / error payloads).
- **`src/infrastructure/http/errors.ts`** — Provides `rejectDatabaseError` for non-CastError database failures.
- **`src/infrastructure/http/request.ts`** — Provides `callerContextOf` to extract the authenticated caller's context for the service call.
- **`src/infrastructure/http/controller.ts`** — Provides `refused` to inspect authorization results and emit the appropriate refusal response.
- **`src/infrastructure/i18n/index.ts`** — Provides `t()` for the localized "not found" message string.
- **`src/modules/feedback/service.ts`** — Provides `feedbackRequestService.remove(id, callerContext)`, the domain operation this controller wraps.
- **`src/modules/feedback/routes.ts`** — Registers `deleteFeedback` as the handler for the `DELETE /feedback/:id` route.

## Notes

- Deliberately answers **404** (not 422) for a malformed or unknown ObjectId, matching the convention used by `createDeleteController`'s own CastError path. The shared `rejectDatabaseError` helper would otherwise default to 422.
- The module doc points to `docs/modules/feedback.md` for broader module context.
