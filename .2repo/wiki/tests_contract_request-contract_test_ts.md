# tests/contract/request-contract.test.ts

## Purpose

Contract-derived **request** tests. For every write endpoint, asserts that the API accepts every payload its own OpenAPI spec declares legal (expect 2xx) and rejects exactly the payloads the spec declares illegal (expect 422 with a `ValidationErrorResponse`-shaped body). This is the mirror image of the rest of `tests/contract/*`, which compare real *responses* against the spec; this file compares spec-derived *requests* against the real API, catching validators that are tighter or looser than their own contract.

## Key elements

- **`withRealOrderReferences(payload, skipField?)`** – Patches a generated `CreateOrderBody` payload with a real `userId` and `items[].productId` (the schema treats both as opaque strings). `skipField` prevents overwriting the exact field an invalid-payload case is testing. Also creates a product with `onHand: 1_000_000_000` so no generated quantity exhausts stock.
- **`withMatchingPasswordConfirm(payload)`** – Sets `passwordConfirm` to match `password` on `SignupBody` payloads, since that cross-field rule is a business rule the schema does not encode.
- **`describe` blocks** (one per write endpoint): `POST /users`, `POST /products`, `POST /orders`, `POST /cart`, `POST /feedback/contact`, `POST /account/signup`, `POST /account/login`. Each contains:
  - A valid-payload test asserting `2xx` + `toSatisfyApiSpec()`.
  - An `it.each(invalidPayloads(...))` table asserting `422`, `body.success === false`, and `toSatisfyApiSpec()`.
- **Zod schemas imported from `@api/schemas.zod`**: `CreateUserBody`, `CreateProductBody`, `CreateOrderBody`, `UpsertCartItemBody`, `CreateFeedbackRequestBody`, `SignupBody`, `LoginBody`.

## Relationships

- **`tests/support/contract-data.ts`** – Source of `validPayload(schema)` and `invalidPayloads(schema)`, the two generators that drive every assertion in this file.
- **`tests/support/contract.ts`** – Imported via `@tests/contract`; registers the `toSatisfyApiSpec()` matcher used in every expectation.
- **`tests/support/http.ts`** – Provides `api()` (supertest wrapper) and `authenticateAs(role)` used to build requests and bearer tokens.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module load to prepare a clean database for the suite.
- **`src/modules/products/tests/fixtures.ts`** – `createProduct()` factory is used to create real product documents (for order/cart reference patching).

## Notes

- **`skipField` / conditional patching pattern.** Whenever a generated payload needs a "fix-up" (real IDs, matching `passwordConfirm`), the fix-up must be *skipped* for the field the current invalid case is exercising. Without this, the test silently sends a valid value and the 422 expectation passes vacuously. This pattern appears in the orders, cart, and signup blocks.
- **Only contract-level validation is tested.** Business rules the schema cannot express (e.g. `quantity ≤ available`, `passwordConfirm === password`) are patched in or excluded; scenario-specific behaviour is the job of dedicated test files.
- **Four documented drift mechanisms** (in the file header): (1) a spec `format` that misdescribes a field (`imageUrl` as `uri` vs. `uri-reference`), (2) `.extend()` on a generated Zod schema silently replacing a field's constraints, (3) coercion-before-validation in `multipart/form-data` handling, (4) validating a `.pick()` subset of a schema so unchecked fields reach Mongoose and produce 500 instead of 422. Each is annotated with the correct fix (often "fix the spec, not the validator").
- **`POST /account/login`** block is truncated in the source but follows the same invalid-payloads-only pattern (no valid-payload test, since login inherently requires a pre-existing account).
