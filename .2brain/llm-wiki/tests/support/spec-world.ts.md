---
source: tests/support/spec-world.ts
sha256: 3a0a0115805a4fa429f4b7b0718b63b90f4b12979d269c7914a78d6e77e677b8
generated_at: 2026-10-15T13:03:06.322386+00:00
model: ollama:qwen3.8:27b
---

# tests/support/spec-world.ts

## Purpose

Shared fixture and URL-resolution layer for spec-driven tests (the fuzz suite and the contract walk). It seeds a minimal set of rows so that templated `{id}` path parameters from `openapi.yaml` resolve to resources that actually exist, letting handlers execute past their 404 guards, and it fills in non-ID parameters and required headers with valid values.

## Key elements

- **`OBJECT_ID`** — A fixed, syntactically valid ObjectId used as the fallback for any path parameter that does not map to a seeded row. A resulting 404 is acceptable; a 500 is not.
- **`World`** (interface) — The three IDs (`productId`, `orderId`, `userId`) available to a single operation's URL resolution.
- **`seedWorld(owner)`** — Creates a product (stock 50), an order for that product owned by `owner`, and a second user; returns their string IDs as a `World`. Must be called once per operation because each test starts on an empty database.
- **`LITERAL_PARAMETERS`** (module-private) — Fixed string values for non-ID path parameters (`locale`, `entityType`, `method`, `provider`, `app`).
- **`parameterValue(path, name, world)`** (module-private) — Resolves a single path parameter to a concrete string: literal → token → kind-specific seeded ID → `OBJECT_ID` fallback.
- **`requiredHeadersOf(operation)`** — Returns a record mapping each required header name to a fresh `randomUUID()` value (currently only `Idempotency-Key`).
- **`buildUrl(operation, world)`** — Substitutes every `{param}` placeholder in `operation.path` via `parameterValue` and returns the concrete URL string.

## Relationships

- **Consumes** `createUser` (`src/modules/users/tests/factories.ts`), `createProduct` (`src/modules/products/tests/factories.ts`), and `createOrder` / `toOrderItem` (`src/modules/orders/tests/factories.ts`) to seed rows.
- **Consumes** the `UserDocument` type from `src/modules/users/index.ts` (re-exported from `src/modules/users/model.ts`) as the `owner` parameter of `seedWorld`.
- **Consumes** the `Operation` type from `tests/support/spec-walk.ts` for path, path-parameters, and required-headers metadata.
- **Consumed by** `tests/fuzz/endpoints.fuzz.test.ts`, `tests/contract/request-contract.test.ts`, and `tests/integration/malformed-ids.test.ts`, which import `seedWorld`, `buildUrl`, and `requiredHeadersOf` to construct requests from the OpenAPI spec.

## Notes

- `seedWorld` is per-operation by design: every test case runs against a freshly emptied database, so reusing a `World` across operations would reference deleted rows.
- `parameterValue` is intentionally private; callers go through `buildUrl`.
- The `app` literal is hard-coded to `'demo-be'`. A deployment that does not serve that app will reject the request before reading the body, so this value must match the target deployment.
- `requiredHeadersOf` generates a new UUID on every call specifically so that a reused `Idempotency-Key` does not trigger replay or mismatch semantics.
