---
source: src/modules/products/tests/contract/api.contract.test.ts
sha256: 0d46c2b20f02cac02e7692ff29001a2faee055db1c6d5358ff52115c0f3fc559
generated_at: 2026-09-27T15:34:09.477962+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/products` API. They assert that every wire response (and error shape) conforms to the schema declared in `openapi.yaml`, including `additionalProperties: false` guards that catch accidental field leaks. Behavioural logic (visibility by role, pagination math) is deferred to unit/service suites; this file only ensures each contract branch is actually exercised and the response *shape* is correct.

## Key elements

- **`GET /products` describe block** — Anonymous, admin, empty-list, and paginated calls must match the contract. Also pins pagination boundary rejections (`page=0`, `page=abc`, `page=1.5`, `pageSize=500` → 422) and blank-param tolerance.
- **Repeated `?id=` batch filter tests** — Validates the widened array schema, the 100-element cap (422), empty-string rejection, duplicate-ID dedup, and that one malformed ObjectId poisons the whole batch (422).
- **Text-length guard test** — `?text=` over 200 chars → 422, preventing an unbounded regex from reaching Mongo.
- **`POST /products/search`** — Single contract-shape check for the search endpoint.
- **`GET /products/{id}`** — 200 for existing, 404 for missing, and a `withEnvironment` case proving `NODE_DEFAULT_CURRENCY` is read live (FA37: no hard-coded EUR).
- **`DELETE /products/{id}`** — Soft-delete default, `hardDelete=false` string-truthiness guard, `hardDelete=true` hard path, non-boolean rejection (422), and contradictory-source resolution (OR semantics: any `true` wins; any undecodable value still 422).
- **`stored(id)` helper** — Reads the row via `productRepository.findByIdRaw` so soft-deleted records remain visible for assertion.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Imported as `@tests/contract`; injects global response-schema validation against `openapi.yaml` for every request made through the `api()` helper. |
| `tests/support/http.ts` | Provides `api()` (request builder) and `authenticateAs()` (role bearer token) used in every test. |
| `tests/support/setup-test-db.ts` | Called once at module scope (`setupTestDb()`) to provision the in-memory database before any test runs. |
| `tests/support/environment.ts` | `withEnvironment` overrides `NODE_DEFAULT_CURRENCY` for the currency test, then restores it. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds rows with controllable fields (title, active, etc.) for each scenario. |
| `src/modules/products/repository.ts` | `productRepository.findByIdRaw` is used by the local `stored()` helper to verify soft vs. hard delete state directly from the collection. |

## Notes

- The `hardDelete` boolean is parsed from a **string** query param; the test explicitly pins that `?hardDelete=false` must **not** be treated as a truthy string (a classic bug the test guards against).
- Contradictory `hardDelete` sources (query vs. body) resolve by **OR**, not precedence: any `true` triggers a hard delete, but any undecodable value still yields 422 even if the other source says `true`.
- The `title`/`active` filter tests assert the *invariant* (a stranger never sees inactive rows) rather than the specific merge strategy, so the test stays valid across backend implementations.
- All pagination and `id`-batch limits are inherited from shared OpenAPI schemas (`shared/contracts/openapi.root.yaml`), not hard-coded here.
