---
source: tests/contract/request-contract.test.ts
sha256: 7e4f3a5c01cc9474ba45145b03cf0e475729ad7fdef9a19dcc6dcc35958d1645
generated_at: 2026-09-27T15:48:24.929879+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/request-contract.test.ts

## Purpose

Contract-derived request tests that verify, for every write endpoint, that the API accepts every payload its OpenAPI spec declares legal (expect 2xx) and rejects every payload the spec declares illegal (expect 422 + `ValidationErrorResponse`). This is the request-side mirror of the response contract tests in `tests/contract/*`: those check real responses against `openapi.yaml`; this checks `openapi.yaml`-derived requests against the real API. It exists to catch validators that are either tighter or looser than the spec.

## Key elements

- **`withRealOrderReferences(payload, skipField?)`** — Patches a generated `CreateOrderBody` with a real `userId` and real `productId` per item, since the schema treats those as opaque strings. The `skipField` param prevents overwriting the field the invalid-payload case is actually testing.
- **`withMatchingPasswordConfirm(payload)`** — Copies `password` into `passwordConfirm` to satisfy a cross-field rule the schema doesn't express independently.
- **`withRealRole(payload)`** — Replaces the randomly generated `role` string with `'customer'`, since roles are deployment data and any random string is contract-legal but names no real role.
- **`withRealTranslations(payload)`** — Replaces the generated `translations` record with `en` (the real fallback locale) so the locale row lookup succeeds.
- **`describe` blocks** — One per write endpoint (`POST /users`, `POST /products`, `POST /orders`, `POST /cart`, `POST /feedback/contact`, …). Each block has a "accepts a legal payload" test (expect 2xx) and an `it.each(invalidPayloads(...))` table of rejection cases (expect 422, `body.success === false`).
- **`beforeAll` / `afterAll`** — Registers and clears `localeService.setTranslatables` so the product-translation pipeline is active during tests.
- **`beforeEach` (products block)** — Creates an `en` locale row via `localeRepository.create(makeLocale(...))` so `withRealTranslations` references an existing record.

## Relationships

- **`tests/support/contract-data.ts`** — Source of `validPayload(schema)` (generates one legal payload from a Zod schema) and `invalidPayloads(schema)` (generates the table of single-field violations). All endpoint tests consume its output directly.
- **`tests/support/contract.ts`** — Imported as a side-effect (`import '@tests/contract'`); presumably registers shared contract-test helpers or matcher extensions before the suite runs.
- **`tests/support/http.ts`** — Provides `api()` (supertest wrapper) and `authenticateAs(role)` used in every request.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module level to (re)initialise the test database before any test executes.
- **`tests/support/spec-walk.ts`** — `listOperations` and `SchemaNode` are imported; used upstream by `contract-data` or in truncated portions of this file to enumerate spec operations.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` creates a real product document, used by order/cart tests to supply a valid `productId`.
- **`src/modules/products/repository.ts`** — `productRepository.existsById` and `.writeTranslatedFields` are wired into `localeService.setTranslatables` so the translation pipeline resolves against the real repository.
- **`src/modules/locales/repository.ts`** — `localeRepository.create` inserts the `en` locale row in the products `beforeEach`.
- **`src/modules/locales/factories.ts`** — `makeLocale` builds the locale document passed to `localeRepository.create`.
- **`src/modules/locales/services/index.ts`** — `localeService.setTranslatables` is configured in `beforeAll`/`afterAll` to activate/deactivate the product translation hook.

## Notes

- **`skipField` discipline.** When an invalid-payload case targets a specific field (e.g. `userId`), the real-reference patchers must skip that field. Failing to skip silently replaces the violation with a valid value, making the test pass vacuously. The `field === 'items'` guard in the orders block and the `field === 'productId'` guard in the cart block follow the same pattern.
- **Scope boundary.** This file only asserts schema/contract conformance. Business rules the schema cannot express (`quantity ≤ available`, `passwordConfirm === password`, cross-reference existence) are either patched in locally or left to dedicated scenario tests.
- **The four drift mechanisms** documented in the file header (spec format mismatch, `.extend()` field replacement, pre-validation coercion, partial-schema validation) are known, recurring causes of the tighter/looser validator bugs this suite guards against. The correct fix is not always "tighten the validator"—sometimes the spec is wrong.
- **Generated vs. hand-written data.** This file uses `contract-data`'s generators exclusively. Deterministic scenario tests continue to use module-level `tests/factories.ts`; the two are complementary, not interchangeable.
