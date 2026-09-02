# src/infrastructure/surfaces/create-delete-controller.ts

## Purpose

Factory that builds a fully-wired Express delete handler (soft and hard) for any entity. Each module's own controller file (e.g. `delete-orders.ts`) supplies only the four per-entity differences—entity name, service `remove` call, audit action, and i18n not-found key—and this factory assembles the shared plumbing: id extraction, `hardDelete` flag merging, schema validation, audit emission, and error mapping.

## Key elements

- **`DeleteControllerSpec`** (exported interface) — the four inputs a module must provide: `entity`, `remove`, `auditAction`, `notFoundKey`.
- **`createDeleteController`** (exported function) — accepts a `DeleteControllerSpec` and returns a single Express handler named `delete<CapitalizedEntity>` (e.g. `deleteOrder`) via a computed property key so `handler.name` is meaningful in stack traces and logs.
- **`RemoveResult`** (internal interface) — the envelope a module's `remove` callback must return: `{ success, status, message?, errors? }`.
- **Handler internals** (not exported):
  - Extracts and validates `:id` from the route; 422 on missing/malformed.
  - Merges `hardDelete` from path/query/body with **OR semantics** (any `true` wins), then validates against `hardDeleteSchema`.
  - Delegates to `remove(id, hardDelete)`; on refusal sends the service-provided error envelope.
  - On success emits an audit event (resolving `auditAction` which may be a value or a function of `hardDelete`) and sends a 200.
  - Catches `CastError` of kind `ObjectId` → 404 with the entity-specific i18n message; other errors → generic database error response.

## Relationships

- **`@infrastructure/http/controller`** — calls `refused()` to short-circuit when the service signals refusal, and `rejectValidation()` for schema-parse failures.
- **`@infrastructure/http/errors`** — calls `rejectDatabaseError()` as the fallback error handler for unexpected exceptions.
- **`@infrastructure/http/request`** — calls `extractAndValidateId()` for the route param, `readInput()` to merge multi-source `hardDelete`, and `callerContextOf()` to build the audit actor context.
- **`@infrastructure/http/response`** — calls `successResponse()` and `rejectResponse()` to emit the final HTTP envelopes; imports `ResponseErrorItem` as a type.
- **`@infrastructure/http/schemas`** — imports `hardDeleteSchema` to validate the merged boolean.
- **`@infrastructure/i18n`** — calls `t(notFoundKey)` to resolve the entity-specific 404 message.
- **`@infrastructure/observability/audit`** — calls `buildAuditEvent()` and `emitAuditEvent()` on every successful delete; imports `AuditAction` as a type.
- **`src/modules/orders/controllers/delete-orders.ts`**, **`delete-products.ts`**, **`delete-users.ts`** — downstream consumers that each import `createDeleteController` and pass a `DeleteControllerSpec` to obtain their entity-specific handler.

## Notes

- `hardDelete` is merged with **OR**, not first-source-wins. This is deliberate: `false` is the default (what nobody types), so it must never outvote an explicit `true` sent on a different transport (query vs. body vs. path).
- `auditAction` may be a plain string or a `(hardDelete: boolean) => AuditAction` function. The `users` module uses the function form so the audit log can distinguish "soft-deleted (reversible)" from "hard-deleted (record scrubbed)" as different actions.
- A malformed ObjectId that passes `extractAndValidateId`'s shape check but fails Mongoose's internal cast is intercepted as a `CastError` and mapped to the **same 404** a legitimate unknown id receives—callers cannot distinguish "doesn't exist" from "isn't a valid id."
- The handler is built as a computed property (`{ [operation](…) }[operation]`) rather than a named function expression so that `handler.name` carries the entity-specific name in all runtime surfaces.
