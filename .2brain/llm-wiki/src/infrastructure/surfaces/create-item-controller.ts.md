---
source: src/infrastructure/surfaces/create-item-controller.ts
source_sha256: 3fd95ebea13fcaa506a428dda4799636eebc6163879143e1dd01ebcd2eff63ea
context_sha256: 935d76462028e98948ccf18fd465b74c631b5db5fdf2812953ba82ae6356a6dd
generated_at: 2026-11-22T03:10:27.961536+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/surfaces/create-item-controller.ts

## Purpose
Provides `createItemController`, a shared factory for a module's "read one by path id" Express handler. It exists so the decision "a malformed id answers as an unknown one (404 with the module's own key)" has a single landing site instead of being repeated inline per module.

## Key elements
- **`ItemControllerSpec`** – the per-entity config:
  - `entity`: lower-case singular name (e.g. `'product'`); used to name the operation.
  - `fetch(id, request)`: module-specific lookup returning `Promise<unknown>`. It receives the request because visibility depends on the caller (e.g. `callerScope` narrowing, `requirePermission`). A miss is `null`/`undefined`/`void`; any other value is serialized as is.
  - `notFoundKey`: i18n key used for the 404 message.
- **`createItemController(spec)`** – returns a named Express handler (e.g. `getProductItem`) that:
  1. Calls `requireId` with `{ notFound: notFoundKey }`. If the id is invalid, it stops before touching the database.
  2. Calls `fetch(id, request)`.
  3. On a falsy result, sends a 404 via `rejectResponse` with `t(notFoundKey)`.
  4. Otherwise calls `setEtag(response, item)` and then `successResponse(response, item)`.
  5. Any thrown or rejected error goes to `catchAs(response, operation)`.

## Relationships
- `src/infrastructure/http/controller.ts`: supplies `operationName('get', entity, 'Item')`, `namedHandler` (names the handler for stack traces, logs and `docs/modules/`) and `catchAs` (database-error rejection).
- `src/infrastructure/http/ids.ts`: `requireId` validates the path id and answers the 404 itself.
- `src/infrastructure/http/preconditions.ts`: `setEtag` sets the version that an edit form later sends back as `If-Match`.
- `src/infrastructure/http/response.ts`: `rejectResponse` and `successResponse` write the responses.
- `src/infrastructure/i18n/index.ts`: `t` translates `notFoundKey`. (`src/infrastructure/i18n/context.ts` is a graph neighbor but is not imported here.)
- Consumers: `src/modules/example/controllers/get-example.ts`, `src/modules/products/controllers/get-product.ts`, `src/modules/users/controllers/get-user.ts` and `src/modules/webhooks/controllers/get-subscription.ts` are the module controllers that provide the spec for their own entity.
- `tests/unit/infrastructure/surfaces/create-item-controller.test.ts` covers this factory.

## Notes
- The controller never inspects the fetched row. Any truthy value is treated as found and gets an ETag.
- `fetch` is expected to signal a miss by returning an empty value, not by throwing.
- A malformed id and a missing row produce the same 404 and message by design.
