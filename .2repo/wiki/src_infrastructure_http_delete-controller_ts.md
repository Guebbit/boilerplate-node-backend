# src/infrastructure/http/delete-controller.ts

## Purpose

A single factory that produces the full `DELETE /x`, `DELETE /x/:id`, and `DELETE /x/:id/hard` handler for any entity. It replaces three byte-identical per-module controllers (orders, products, users) with one implementation whose only per-entity differences are the service call, audit action, and i18n not-found key. Each module still owns a small file that calls the factory, satisfying the one-controller-per-file convention while centralising the shared logic.

## Key elements

- **`DeleteControllerSpec`** (interface) — the four per-entity parameters: `entity` (lower-case singular name), `remove(id, hardDelete)` (the service call), `auditAction`, `notFoundKey`.
- **`RemoveResult`** (interface) — the envelope `remove` must return: `{ success, status, message?, errors? }`.
- **`createDeleteController(spec)`** (exported factory) — returns a single Express handler whose runtime name is `delete<Entity>` (e.g. `deleteOrder`), built via a computed-property object literal so stack traces and generated docs see the entity-specific name.
  - Extracts and validates the ObjectId from the URL.
  - Resolves `hardDelete` from path/query/body via `readInput` with `anyTrue` OR-semantics, then validates through `hardDeleteSchema`.
  - Calls the service `remove`, emits an audit event on success, or short-circuits via `refused`.
  - Maps Mongoose `CastError` (kind `ObjectId`) to a 404 with the entity's `notFoundKey`; all other errors go to `rejectDatabaseError`.

## Relationships

- **`./controller`** — imports `refused` (early-exit when service already wrote the response) and `rejectValidation` (422 for bad `hardDelete` input).
- **`./errors`** — imports `rejectDatabaseError` for non-ObjectId failures.
- **`./request`** — imports `extractAndValidateId`, `readInput` (multi-surface input reading with `anyTrue`), and `callerContextOf` (audit caller metadata).
- **`./response`** — imports `successResponse`, `rejectResponse`, and the `ResponseErrorItem` type.
- **`./schemas`** — imports `hardDeleteSchema` (Zod) for runtime validation of the resolved flag.
- **`@infrastructure/i18n`** — imports `t` to translate the `notFoundKey`.
- **`@infrastructure/observability/audit`** — imports `emitAuditEvent`, `buildAuditEvent`, and the `AuditAction` type.
- **`src/modules/{orders,products,users}/controllers/delete-*.ts`** — the three consumer sites; each supplies a `DeleteControllerSpec` and re-exports the named handler.

## Notes

- **`hardDelete` OR-semantics:** the flag is resolved by OR-ing across path segment, query, and body. Any `true` wins; an undecodable value in *any* source yields a 422 regardless of other sources. This is deliberate — `false` is the default, so a spurious `false` must never outrank an explicit `true`.
- **Handler naming via computed property:** the handler is constructed as `{ [operation]: fn }[operation]` so `handler.name` is `deleteOrder` / `deleteProduct` / `deleteUser`. This matters for stack traces and the generated `docs/modules/` surface tables.
- **CastError ≠ validation error:** a malformed ObjectId that survives `extractAndValidateId` and reaches Mongoose surfaces as a `CastError`. It is mapped to the same 404 as a well-formed-but-unknown id, not a 422.
- **`refused` guard:** if the service has already written a response (e.g. a 204 or a custom status), the factory short-circuits and skips audit emission and `successResponse`.
