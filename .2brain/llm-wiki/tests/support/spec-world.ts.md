---
source: tests/support/spec-world.ts
sha256: 3a0a0115805a4fa429f4b7b0718b63b90f4b12979d269c7914a78d6e77e677b8
generated_at: 2026-11-08T10:01:25.745014+00:00
model: ollama:qwen3.8:27b
---

# tests/support/spec-world.ts

## Purpose

Shared test infrastructure that turns a templated OpenAPI path (e.g. `/orders/{orderId}/items`) into a concrete URL whose `{id}` placeholders resolve to real, freshly-seeded database rows. This lets the fuzz suite and the write-operation contract walk exercise handlers past their 404 guards rather than stopping at "not found."

## Key elements

- **`OBJECT_ID`** – A fixed, syntactically valid ObjectId that nothing owns. Used as a fallback for path parameters whose resource kind is not seeded; a 404 is an acceptable outcome, a 500 is not.
- **`World`** (interface) – The three IDs (`productId`, `orderId`, `userId`) that a seeded test database contains.
- **`seedWorld(owner)`** – Creates one product (50 on hand), one order for that product owned by `owner`, and a second user. Returns their IDs as a `World`. Must be called per operation because each test starts on an empty database.
- **`LITERAL_PARAMETERS`** (internal) – Fixed string values for non-ID path parameters (`locale`, `entityType`, `method`, `provider`, `app`). `app` must name an app this deployment actually serves; an unknown value is refused before the request body is read.
- **`parameterValue(path, name, world)`** (internal) – Resolves a single path-parameter name to a value: looks up `LITERAL_PARAMETERS` first, then matches the parameter name or path prefix to the correct `World` ID, falling back to `OBJECT_ID`.
- **`requiredHeadersOf(operation)`** – Returns a record with a fresh `randomUUID()` for every header the operation marks as required (currently only `Idempotency-Key`; a reused key replays or mismatches).
- **`buildUrl(operation, world)`** – Substitutes every `{param}` in `operation.path` with the value returned by `parameterValue`, producing a ready-to-send URL string.

## Relationships

- **`src/modules/users/tests/factories.ts`** – Imports `createUser` to seed the second user.
- **`src/modules/products/tests/factories.ts`** – Imports `createProduct` to seed the product.
- **`src/modules/orders/tests/factories.ts`** – Imports `createOrder` and `toOrderItem` to seed the order.
- **`src/modules/users/index.ts`** – Imports the `UserDocument` type used as the `owner` parameter of `seedWorld`.
- **`tests/support/spec-walk.ts`** – Imports the `Operation` type; `buildUrl` and `requiredHeadersOf` consume its `path`, `pathParameters`, and `requiredHeaders` fields.
- **`tests/fuzz/endpoints.fuzz.test.ts`** and **`tests/contract/request-contract.test.ts`** – Primary consumers; both call `seedWorld` and `buildUrl` to construct the request URL for each spec operation.

## Notes

- `seedWorld` must be re-invoked for every operation under test; the database is wiped between tests, so IDs from a prior call are stale.
- `parameterValue` relies on path-prefix heuristics (e.g. `/products/`, `/orders/`, `/users/`) to pick the correct ID. Adding a new resource kind to the API requires extending this function and `LITERAL_PARAMETERS` if the new kind has fixed-vocabulary parameters.
- `requiredHeadersOf` generates a new UUID on every call by design—callers must not cache the result across requests if idempotency semantics matter.
