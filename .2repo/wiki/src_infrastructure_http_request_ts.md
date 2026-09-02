# src/infrastructure/http/request.ts

## Purpose

Centralises the rules for reading a route's input across multiple sources (route params, query string, JSON/multipart body) behind a single `readInput` entry point. This lets one controller serve both `GET /products?text=x` and `POST /products/search {text}` without duplicating handler logic, and keeps type-coercion of string-transported values (booleans, numbers, string arrays) out of every individual controller.

## Key elements

- **`readInput<TId>(request, declaration)`** — the sole public entry point. Resolves a route's input according to a `RequestInputDeclaration`, applying surface-based source precedence, per-source string decoding, `anyTrue` OR-resolution, and id first-entry collapsing. Returns a `RequestInput<TId>` (all values `unknown` except declared ids, which are `string`).
- **`RequestSurface`** (`'search' | 'list' | 'write' | 'delete' | 'path'`) — a closed set that determines *which* sources are read and in what precedence (see `SURFACE_SOURCES`).
- **`RequestInputDeclaration<TId>`** — per-route config: `surface`, `ids`, `booleans`, `anyTrue`, `numbers`, `stringArrays`.
- **`SURFACE_SOURCES`** — maps each surface to an ordered array of `RequestInputSource`s, highest precedence first.
- **`parseFormBoolean` / `parseFormNumber`** — decode string-transported scalars; unrecognisable values are returned untouched so the downstream validator (Zod) rejects them with its own message.
- **`getRequestBody`** — guards against Express 5 returning `undefined` for body-less requests.
- **`isMultipartRequest`** — distinguishes multipart bodies (which need decoding) from JSON bodies (which already carry types).
- **`stripUndefined`** (imported from persistence/fixtures) — removes explicit `undefined` keys so they don't leak into Mongoose filter clauses.

## Relationships

- **`src/infrastructure/http/response.ts`** — imports `rejectResponse` for error replies.
- **`src/infrastructure/i18n/index.ts`** — imports `t` to resolve user-facing messages in the request's locale.
- **`src/infrastructure/persistence/fixtures.ts`** — imports `stripUndefined` to clean merged result objects.
- **`src/infrastructure/surfaces/create-delete-controller.ts`**, **`create-list-controller.ts`**, **`create-search-controller.ts`** — surface factories that call `readInput` with the appropriate `RequestSurface` declaration.
- **`src/modules/account/controllers/delete-2fa.ts`**, **`delete-account-confirm.ts`**, **`delete-account-request.ts`**, **`delete-address.ts`** — concrete delete-surface controllers that consume `readInput` (typically with `surface: 'delete'` and `anyTrue: ['hardDelete']`).
- **`src/kernel/middlewares/authorizations.ts`** — supplies the `AuthContext` / `Caller` types that downstream controllers pass alongside the input this module produces.

## Notes

- **`anyTrue` is not a source-precedence rule.** It ORs a field across all sources (any `true` wins), intentionally escaping the `SURFACE_SOURCES` ranking. This exists specifically so a default-shaped `false` in one source cannot outvote an explicit `true` in another.
- **Decoding is per-source, not on the merged result.** A value from `request.query` is always a string and gets decoded; the same key from a JSON body is already typed and is left alone. The `stringTransport` map encodes this per-source decision.
- **Absent ≠ empty.** A key not present in any source is simply absent in the result (no default to `false`/`[]`). An explicit `undefined` value *is* present and is stripped via `stripUndefined`. This distinction matters for partial updates.
- **`parseFormBoolean` handles a wider set than `true`/`false`.** It recognises `'1'`, `'0'`, `'on'`, `'off'`, `'yes'`, `'no'` (case-insensitive, trimmed) because HTML forms and URL queries commonly use those spellings. Anything else is passed through for the validator to reject.
- **`parseFormNumber` leaves empty strings alone** because `Number('')` is `0`, and a blank form field means "not sent", never "zero".
- **The `ids` resolution uses a `||`-chain with a fallback:** the first non-empty value wins, but an empty string is retained if no better value follows (so a trailing `?id=` doesn't crash when the body has the real id).
- **Express 5 body is `undefined`, not `{}`.** The `getRequestBody` guard exists specifically for this; without it, a body-less `DELETE` throws and surfaces as a 500.
