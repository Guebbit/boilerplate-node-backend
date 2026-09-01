# src/infrastructure/surfaces/create-delete-controller.ts

## Purpose

Factory that produces the shared Express handler for the `DELETE /x`, `DELETE /x/:id`, and `DELETE /x/:id/hard` triplet used across every module. Each entity module supplies a small spec (entity name, service call, audit action, not-found key) and receives back a fully-wired handler—id extraction, `hardDelete` flag merging, validation, service dispatch, audit emission, and error mapping—so the cross-cutting logic lives in one place while the per-entity differences stay in the module's own file.

## Key elements

- **`DeleteControllerSpec`** (exported interface) — The four fields a module must provide: `entity` (lower-case singular, e.g. `'order'`), `remove(id, hardDelete)` (the service call), `auditAction`, and `notFoundKey`.
- **`RemoveResult`** (local interface) — The envelope shape returned by `remove`; mirrors what `generateSuccess`/`generateReject` produce (`success`, `status`, optional `message`/`errors`).
- **`createDeleteController`** (exported function) — Accepts a `DeleteControllerSpec`, derives the operation name (`deleteOrder`, `deleteProduct`, …), and returns a named Express handler. The handler:
  1. Extracts and validates `:id` from the route (422 if missing/malformed).
  2. Reads `hardDelete` from path, query, and body via `readInput` with `anyTrue` merging, then validates against `hardDeleteSchema`.
  3. Calls `remove(id, hardDelete)`.
  4. On refusal → short-circuits via `refused`.
  5. On success → emits an audit event and sends `successResponse` with the service's message.
  6. On `CastError` (bad ObjectId) → returns 404 with the entity's `notFoundKey`; other errors → `rejectDatabaseError`.

## Relationships

- **`src/infrastructure/http/controller.ts`** — Imports `refused` (detects service-level refusal) and `rejectValidation` (422 path for schema failures).
- **`src/infrastructure/http/errors.ts`** — Imports `rejectDatabaseError` for non-CastError failures.
- **`src/infrastructure/http/request.ts`** — Imports `extractAndValidateId`, `readInput`, and `callerContextOf`.
- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse`, `successResponse`, and the `ResponseErrorItem` type.
- **`src/infrastructure/http/schemas.ts`** — Imports `hardDeleteSchema` (Zod schema for the merged flag).
- **`src/infrastructure/i18n/index.ts`** — Imports `t` to resolve the `notFoundKey` into a user-facing message.
- **`src/infrastructure/observability/audit.ts`** — Imports `emitAuditEvent`, `buildAuditEvent`, and the `AuditAction` type.
- **`src/modules/orders/controllers/delete-orders.ts`**, **`src/modules/products/controllers/delete-products.ts`**, **`src/modules/users/controllers/delete-users.ts`** — Each is a thin module-owned file that calls `createDeleteController` with its own spec, satisfying the `controller-naming.test.ts` requirement while delegating all logic here.

## Notes

- The handler is attached via a **computed property key** (`{ [operation](req, res) { … } }[operation]`) so that `handler.name` equals the operation string (e.g. `"deleteOrder"`). This name is what appears in stack traces, audit logs, and the generated `docs/modules/` tables. Renaming the entity in the spec changes the name automatically.
- `hardDelete` is merged with **OR semantics** across path/query/body: any `true` wins. This prevents the default `false` on one surface from overriding an explicit `true` on another.
- A malformed ObjectId reaches Mongoose as a `CastError` rather than a "not found" miss; the handler maps that to the same 404 + `notFoundKey` response a well-formed unknown id receives, so callers get a uniform error shape.
- On validation or id-extraction failures the handler returns `Promise.resolve()` (with the reject already sent) rather than throwing, keeping the Express chain short.
