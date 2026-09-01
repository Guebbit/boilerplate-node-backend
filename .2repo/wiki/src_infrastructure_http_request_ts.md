# src/infrastructure/http/request.ts

## Purpose
Defines the single entry point (`readInput`) and all supporting rules for extracting and decoding a route's input from the three possible transport locations (URL params, query string, JSON/multipart body). It exists so that controllers never re-assemble source-precedence, type-coercion, or `anyTrue` logic themselves — one declaration object per route fully describes what is read, from where, and how it is decoded.

## Key elements
- **`readInput<TId>(request, declaration)`** — The sole public function. Reads the declared surface's sources in precedence order, decodes string-transport values (booleans, numbers, string arrays), resolves `ids` via first-non-empty `||` chain, resolves `anyTrue` fields by OR across sources, strips explicit `undefined` keys, and returns a flat `RequestInput<TId>` record.
- **`RequestSurface`** — Closed union (`'search' | 'list' | 'write' | 'delete' | 'path'`) that determines which sources are read and in what order.
- **`SURFACE_SOURCES`** — Maps each `RequestSurface` to its ordered source list (e.g. `search → ['body', 'query']`, `path → ['params']`).
- **`RequestInputDeclaration<TId>`** — The per-route config object: `surface`, optional `ids`, `booleans`, `anyTrue`, `numbers`, `stringArrays`.
- **`RequestInput<TId>`** — Return type: `Record<string, unknown> & Partial<Record<TId, string>>`.
- **`parseFormBoolean` / `parseFormNumber`** — Internal decoders for string-transport values; return the input untouched when it is not a recognisable form of the target type, so downstream schema validation owns the error.
- **`getRequestBody`** — Safe read of `req.body` (Express 5 leaves it `undefined` when absent).
- **`isMultipartRequest`** — Content-type check used to decide whether the body needs string-transport decoding.

## Relationships
- **`src/infrastructure/http/response.ts`** — Imports `rejectResponse` (used by callers that follow up on a failed read; the module itself does not invoke it in the visible code).
- **`src/infrastructure/i18n/index.ts`** — Imports the `t` translation function; available for controller-level error messages but not called inside `readInput` itself.
- **`src/infrastructure/surfaces/create-search-controller.ts` / `create-list-controller.ts` / `create-delete-controller.ts`** — Factory functions that build controllers calling `readInput` with the appropriate `surface` value (`'search'`, `'list'`, `'delete'`).
- **`src/modules/account/controllers/delete-*.ts`** — Individual route handlers that declare their `RequestInputDeclaration` (typically `surface: 'delete'` or `'path'`, with `anyTrue: ['hardDelete']` in the account-deletion case) and pass it to `readInput`.
- **`src/kernel/middlewares/authorizations.ts`** — Runs before controllers; does not import this file but sets up the `AuthContext` that a controller may attach after reading input.

## Notes
- **`anyTrue` is not a precedence override in the usual sense.** It ORs across all sources: any single stated `true` wins. An undecodable value in *any* source is passed through intact so the schema can reject it (422) rather than a `true` elsewhere silently deciding the outcome.
- **Decoding is per-source, not on the merged result.** Whether a value needs string-transport decoding depends on where it came from (`?active=false` is always a string; `{"active": false}` is not). Only multipart bodies in the body source are treated as string transport; a JSON body is left as-is.
- **Absent ≠ empty.** Keys whose value is `undefined` in every source are dropped from the result. A blank query parameter (`?hardDelete=`) is treated as "not stated" for `anyTrue` purposes.
- **`ids` resolution uses a `||` chain, not simple precedence.** The first *truthy* entry wins; an empty string in a higher-precedence source does not block a non-empty value in a lower one.
- **Express 5 body is `undefined` by default.** `getRequestBody` guards against this; code that assumes `req.body` is always an object will throw on body-less requests (e.g. `DELETE`).
- **The `t` import from i18n is present but not called in the visible code.** It is available for extension or for controller-level messages that reference this module's helpers.
