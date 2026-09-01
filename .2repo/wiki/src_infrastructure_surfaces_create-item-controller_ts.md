# src/infrastructure/surfaces/create-item-controller.ts

## Purpose

Factory that builds a "read-one" (fetch-by-ID) Express handler for any module. It centralizes the API contract that a missing item *and* a malformed ObjectId both produce a 404 (with the module's own i18n key), while any other database error is delegated to `rejectDatabaseError`. Exists so every module's `getXItem` handler shares one implementation of that contract rather than repeating it inline.

## Key elements

- **`ItemControllerSpec`** — input interface with three fields:
  - `entity` — lower-case singular name (e.g. `'product'`); used to derive the operation name and appears in logs/stack traces.
  - `fetch(id, request)` — module-specific retrieval; returns `unknown` on success or `null`/`undefined`/`void` on a miss. Never expected to throw for a "not found" case.
  - `notFoundKey` — i18n key rendered in the 404 body.
- **`createItemController(spec)`** — returns a named Express handler (e.g. `getProductItem`). Internally:
  - Derives `operation` via string interpolation of `entity`.
  - Uses a computed-property-key object so `handler.name` equals `operation` (avoids the generic `"handler"` name an anonymous function would get).
  - On success: `successResponse`. On miss (`!item`): 404 with `t(notFoundKey)`.
  - On `CastError` with `kind === 'ObjectId'`: same 404 (a malformed ID is treated as "not found," not a 500).
  - On any other error: `rejectDatabaseError`.

## Relationships

- **`src/infrastructure/http/response.ts`** — imports `rejectResponse` (404) and `successResponse` (200) to shape the HTTP reply.
- **`src/infrastructure/http/errors.ts`** — imports `rejectDatabaseError` as the catch-all for non-CastError failures.
- **`src/infrastructure/i18n/context.ts` / `index.ts`** — imports `t` to translate the module-specific `notFoundKey` into the response body.
- **`src/modules/products/controllers/get-product-item.ts`** — consumer; calls `createItemController` with `{ entity: 'product', … }` and exports the resulting `getProductItem` handler.
- **`src/modules/users/controllers/get-user-item.ts`** — consumer; calls `createItemController` with `{ entity: 'user', … }` and exports `getUserItem`.

## Notes

- The `fetch` callback receives the full `Request`, not just the id, because per-module visibility rules (`callerScope` for products, `isAdmin` for users) need access to auth context.
- The 404-for-CastError behavior is intentional: a random string in the URL should be indistinguishable from a valid-but-unknown ID, avoiding information leakage.
- The computed-property-key trick (`{ [operation](…) }[operation]`) is load-bearing — renaming or refactoring it to a plain `function handler(…)` will silently break the operation name that appears in stack traces, log lines, and generated docs.
