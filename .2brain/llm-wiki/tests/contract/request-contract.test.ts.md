---
source: tests/contract/request-contract.test.ts
sha256: b72e2371cb96dc855a51b3555454b11d155f176671e78b279fbbe78efb32ac10
generated_at: 2026-10-15T12:33:15.498676+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/request-contract.test.ts

## Purpose

Contract-derived **request** tests: for every write endpoint, verifies the API accepts every payload its OpenAPI spec declares legal (expect 2xx) and rejects exactly what the spec declares illegal (expect 422 + `ValidationErrorResponse` shape). It is the mirror image of the response-contract tests in `tests/contract/*` — those check responses against the spec; this file checks spec-generated requests against the live API.

## Key elements

- **`withRealOrderReferences(payload, skipField?)`** — Patches a generated `CreateOrderBody` payload with a real `userId` and `productId`, clamps item `quantity` to 1, and skips patching the field currently under test (the `skipField` guard prevents silently fixing the violation being asserted).
- **`withMatchingPasswordConfirm(payload)`** — Copies `password` into `passwordConfirm` so cross-field equality isn't the failure cause.
- **`withRealRole(payload)`** — Replaces the randomly generated `role` string with `'customer'`, since the schema has no enum and the API requires a declared role.
- **`withRealTranslations(payload)`** — Replaces the generated `translations` key with `'en'` so it matches a seeded locale row.
- **`describe` blocks** — One per write endpoint (`POST /users`, `POST /products`, `POST /orders`, `POST /cart`, and further endpoints in the truncated section). Each contains a valid-payload test (expect 2xx) and an `it.each(invalidPayloads(...))` parameterized suite (expect 422, `success: false`).
- **`beforeAll` / `afterAll`** — Registers and clears `localeService.setTranslatables` for the product collection (wiring `productRepository` callbacks into the translation pipeline).
- **`beforeEach` (products suite)** — Seeds an `'en'` locale via `localeRepository.create(makeLocale(...))`.

## Relationships

- **`tests/support/contract-data.ts`** — Source of `validPayload` and `invalidPayloads`; the generic walker that generates one legal / N illegal payloads per Zod schema.
- **`tests/support/http.ts`** — Provides `api()` (supertest app) and `authenticateAs` (token acquisition per role).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` resets the test database before the suite runs.
- **`tests/support/contract.ts`** — Side-effect import (`@tests/contract`); likely registers global matchers or setup shared across contract tests.
- **`src/modules/products/tests/factories.ts`** — `createProduct` creates a real product document for reference-patching.
- **`src/modules/locales/factories.ts`** — `makeLocale` builds the locale document seeded in the products `beforeEach`.
- **`src/modules/locales/repository.ts`** — `localeRepository.create` persists that document.
- **`src/modules/locales/services/index.ts`** — `localeService.setTranslatables` hooks the product translation pipeline.
- **`src/modules/products/repository.ts`** — `existsById`, `writeTranslatedFields`, `markEdited` are passed as callbacks into the translatables registration.
- **`src/modules/users/tests/factories.ts`** — `PLAIN_PASSWORD` (used in truncated signup/login suites).
- **`tests/support/shopper-routes.ts`** — `roleReaching` (used in truncated endpoint suites).
- **`tests/support/spec-walk.ts`** / **`tests/support/spec-world.ts`** — `listOperations`, `seedWorld`, `buildUrl`, `requiredHeadersOf`, etc. (used in truncated endpoint suites for non-POST or multi-step endpoints).

## Notes

- **`skipField` is load-bearing.** Every invalid-payload test for `userId` (or `productId`, `items`, etc.) relies on this guard. Removing it causes the patch helper to silently replace the violation under test, making the case pass for the wrong reason.
- **Quantity clamping is intentional, not a workaround.** The generated value (999) is the schema's hard ceiling; a shop's per-line cap (default 10) is a business rule outside the contract. Clamping to 1 isolates the *shape* assertion from business-rule rejection.
- **Patching pattern is uniform.** Any field the schema types as an opaque string (`userId`, `productId`, `role`, `translations` keys) that must reference real runtime data gets a small `with*` helper. Add a new helper rather than inlining the patch, and always guard with `skipField` (or the `field ===` check) so invalid-payload cases aren't self-defeating.
- **This file is additive to, not a replacement for, scenario tests.** Module `tests/factories.ts` files cover specific business scenarios; this file only asks "does the API honour its own contract for *any* legal/illegal input." Do not add scenario-specific assertions here.
- **The file is truncated in this view.** The visible portion covers `/users`, `/products`, `/orders`, `/cart`; additional endpoints (signup, login, feedback, etc.) and the imports for `spec-walk`/`spec-world`/`shopper-routes` belong to those unseen suites.
