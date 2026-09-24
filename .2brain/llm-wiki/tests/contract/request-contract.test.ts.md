---
source: tests/contract/request-contract.test.ts
sha256: ec1e7099fe77cf00917a45fbde0d2161bacdd2370023ce44c244f313a02517ca
generated_at: 2026-09-23T19:52:14.214081+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/request-contract.test.ts

## Purpose

Contract-derived **request** tests: for each write endpoint, it asserts the API accepts every payload its OpenAPI contract declares legal (2xx) and rejects every payload the contract declares illegal (422 + `ValidationErrorResponse`). This is the mirror image of the response-contract tests in `tests/contract/*`—those compare real responses against `openapi.yaml`; this file compares `openapi.yaml`-derived requests against the real API. It exists to catch validators that are tighter or looser than the spec they are supposed to enforce.

## Key elements

- **`withRealOrderReferences(payload, skipField?)`** – Patches a generated `CreateOrderBody` with a real `userId` and a real `productId` (created with a very large `onHand` so no quantity constraint fires). The `skipField` parameter prevents overwriting the field currently under test in invalid-payload cases.
- **`withMatchingPasswordConfirm(payload)`** – Sets `passwordConfirm` to mirror `password`, satisfying a cross-field rule the schema does not itself express.
- **`withRealRole(payload)`** – Replaces the schema-legal random `role` string with `'customer'`, a role that actually exists in the deployment.
- **`withRealTranslations(payload)`** – Pins `translations` to the `'en'` key so it matches the locale row created in `beforeEach`.
- **`describe` blocks** (one per write endpoint: `POST /users`, `/products`, `/orders`, `/cart`, `/feedback/contact`, plus auth endpoints) – Each runs `validPayload(Schema)` expecting 2xx, then iterates `invalidPayloads(Schema)` expecting 422 with `success: false`.
- **`beforeAll` / `afterAll`** – Registers and clears `localeService.setTranslatables` for the product entity.
- **`beforeEach` (products block)** – Creates an `'en'` locale row via `localeRepository`.

## Relationships

| Neighbor                                  | Interaction                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `tests/support/contract.ts`               | Imported as side-effect (`@tests/contract`); provides the `toSatisfyApiSpec()` matcher used in every assertion. |
| `tests/support/contract-data.ts`          | Source of `validPayload()` and `invalidPayloads()`—the OpenAPI-derived payload generators.                      |
| `tests/support/http.ts`                   | Provides `api()` (supertest wrapper) and `authenticateAs()` for bearer-token auth.                              |
| `tests/support/setup-test-db.ts`          | `setupTestDb()` called at module top to reset the database.                                                     |
| `src/modules/products/tests/factories.ts` | `createProduct()` supplies a real product document for order/cart reference patching.                           |
| `src/modules/locales/factories.ts`        | `makeLocale()` builds the locale object persisted in the products `beforeEach`.                                 |
| `src/modules/locales/repository.ts`       | `localeRepository.create()` persists that locale row.                                                           |
| `src/modules/locales/services/index.ts`   | `localeService.setTranslatables()` / `setTranslatables({})` in `beforeAll`/`afterAll`.                          |

## Notes

- **`skipField` is load-bearing.** Omitting it (or always patching) would silently replace the violation under test with a valid value, making the invalid-payload case a no-op. The orders block passes `field` directly; the cart block special-cases `field === 'productId'`.
- **Business rules are out of scope.** `quantity ≤ available`, cross-field `passwordConfirm === password`, and "role must exist" are not schema constraints; they are patched in here only so the _schema-level_ assertion isn't masked. Each has its own scenario test elsewhere.
- **Generated data is additive.** This file does not replace hand-written factory tests; it answers the orthogonal question "does the API honour its own contract for _any_ legal input?"
- **Four drift mechanisms** (documented in the header comment) are the expected failure modes: spec-format mismatch, `.extend()` dropping constraints, coercion-before-validation, and partial schema validation. Each requires a different fix—tightening the validator is not always correct.
