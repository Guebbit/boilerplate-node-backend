# src/infrastructure/surfaces/create-search-controller.ts

## Purpose

Factory that produces a single Express handler for a module's `POST /x/search` endpoint. It centralises the request pipeline (read input → overlay → validate → run search → respond / error) so that the `products`, `users`, and `orders` modules only supply what differs: the Zod schema, any extra input overlay, and the actual search logic. `feedback` deliberately does **not** use this (see `get-feedback.ts`).

## Key elements

- **`SearchControllerSpec<TSchema, TResult>`** — the interface a module passes in. Fields:
  - `entity` – plural noun (e.g. `'products'`); used to derive the handler name and log label.
  - `schema` – Zod schema the merged input is validated against.
  - `extendInput?` – optional overlay function applied to `readInput`'s output before validation (coercions, request-derived values).
  - `runSearch` – the module's search; receives the validated input and the raw `Request`.
- **`createSearchController`** – the exported factory. Returns a single named handler (e.g. `getProducts`) that chains:
  1. `readInput(request, { surface: 'search', ids: ['id'] })`
  2. `extendInput` overlay (if provided)
  3. `parseBody(schema, merged, response)` — returns `undefined` on 422
  4. `runSearch(parsed, request)` → `successResponse` or `catchAs`

## Relationships

- **`@infrastructure/http/request`** (`readInput`) — called to merge params/query/body into one object under the `'search'` surface rules.
- **`@infrastructure/http/controller`** (`parseBody`, `catchAs`) — `parseBody` validates and 422s on failure; `catchAs` logs the error under the derived operation name and returns 500.
- **`@infrastructure/http/response`** (`successResponse`) — writes the JSON success envelope.
- **`src/modules/products/controllers/get-products.ts`**, **`get-users.ts`**, **`get-orders.ts`** — each calls `createSearchController` with its own spec to obtain the handler it mounts at `POST /…/search`.

## Notes

- The handler's `name` is set via a **computed property key** (`{ [operation](…){} }[operation]`), not an assignment. This makes stack-trace and log labels read `getProducts` rather than an anonymous name. Don't "simplify" to a plain arrow function.
- `extendInput` returns **only the overlay object**, not the full merged result; the factory spreads it over the base input. Returning the whole merged object would double-apply keys.
- `ids: ['id']` is hard-coded into the `readInput` call; a module that needs a different id param must handle it in `extendInput`.
- On `parseBody` failure the handler returns early (`if (!parsed) return`) — no `runSearch` call, no `catchAs`.
