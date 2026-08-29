# tests/contract/request-contract.test.ts

## Purpose

Contract-derived **request** tests: for every write endpoint, asserts the API accepts every payload its own OpenAPI contract declares legal (2xx) and rejects exactly what it declares illegal (422 + `ValidationErrorResponse` body). This is the mirror image of the rest of `tests/contract/*`, which compare a known-good real **response** against `openapi.yaml`; this file compares spec-derived **requests** against the live API. It exists to catch validator drift in both directions (validator tighter or laxer than the spec) that scenario tests cannot surface.

## Key elements

- **`withRealOrderReferences(payload, skipField?)`** — Patches generated `CreateOrderBody` payloads with a real `userId` and `items[].productId`, and creates the product with `onHand: 1_000_000_000` so quantity constraints don't interfere. `skipField` prevents overwriting the very field an invalid-payload case is testing.
- **`withMatchingPasswordConfirm(payload)`** — Sets `passwordConfirm` to equal `password`, a cross-field business rule the schema itself does not encode.
- **Seven `describe` blocks** — One per write endpoint: `POST /users`, `POST /products`, `POST /orders`, `POST /cart`, `POST /feedback/contact`, `POST /account/signup`, `POST /account/login`. Each contains a single "accepts valid" assertion and an `it.each(invalidPayloads(…))` loop expecting 422 + `success: false` + `toSatisfyApiSpec()`.
- **`validPayload` / `invalidPayloads`** (imported from `@tests/contract-data`) — Generate payloads from the Zod schemas in `@api/schemas.zod`; this file never hand-constructs a payload.

## Relationships

- **`tests/support/contract-data.ts`** — Source of `validPayload()` and `invalidPayloads()`; the entire test matrix is driven by whatever the OpenAPI-derived schema declares.
- **`tests/support/http.ts`** — `api()` and `authenticateAs()` provide the supertest agent and role-based bearer tokens.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` resets the database before the suite runs.
- **`src/modules/products/tests/factory.ts`** — `createProduct()` creates a real product for order/cart reference-linking.
- **`docs/theory/request-input.md`** — Referenced in the file header for the multipart/form-data coercion path (`readInput`) that can mask type errors from the validator.
- **`docs/tools/contract-request-data.md`** — Documents the `contract-data` module that generates the payloads this file consumes.
- **`docs/theory/request-flow.md`** — Contextual reference for how requests flow through validation before reaching the handler.

## Notes

- **Skip-field discipline is critical.** For orders, cart, and signup, the "fix up" helpers (`withRealOrderReferences`, `productId` patch, `withMatchingPasswordConfirm`) must be bypassed when the field under test is the one being patched. The previous bug: always patching `userId` silently fixed every "userId missing/wrong-type" case, making it pass trivially.
- **Opaque reference fields.** The schema has no way to express "must be a real document ID," so `userId`, `productId`, and `items[].productId` are plain strings to the validator. This file patches them to real IDs to avoid a 500 (Mongoose `CastError`) masking the 422 the contract promises.
- **Quantity is not a schema constraint.** The test product uses `onHand: 1_000_000_000` so that `quantity ≤ available` (a business rule, not a contract rule) cannot cause a spurious failure.
- **Login block is invalid-payloads only.** The `POST /account/login` describe is annotated "invalid payloads only" — a valid login is covered by scenario tests, not here.
- **Additive convention.** Generated payloads are additive (same as a module's `tests/factory.ts`); deterministic scenario tests continue to use hand-written factories. This file answers "does the API honour its contract for *any* legal input," not "does this specific scenario work."
