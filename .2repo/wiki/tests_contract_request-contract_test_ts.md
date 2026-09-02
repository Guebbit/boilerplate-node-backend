# tests/contract/request-contract.test.ts

## Purpose

Contract-derived **request** tests: for every write endpoint, verifies the API accepts every payload its OpenAPI spec declares legal (→ 2xx) and rejects every payload the spec declares illegal (→ 422 with a `ValidationErrorResponse` body). This is the mirror image of the other `tests/contract/*` files, which compare a real *response* against `openapi.yaml`; here, spec-derived *requests* are compared against the real API. It exists to catch validator drift in both directions (too tight, too lax) that scenario tests cannot answer.

## Key elements

- **`withRealOrderReferences(payload, skipField?)`** — Patches a generated `CreateOrderBody` payload with a real `userId` and `items[].productId` (the schema treats both as opaque strings). The `skipField` parameter prevents overwriting the very field an invalid-payload case is testing.
- **`withMatchingPasswordConfirm(payload)`** — Sets `passwordConfirm` to equal `password`; a cross-field rule the schema doesn't encode independently.
- **`withCompliantPassword(payload)`** — Replaces the generated `password` with `'Aa1!aaaa'` to satisfy the hand-enforced complexity rule in `zodUserSchema` (expressed only in prose in the spec, not as a machine-checkable `pattern`).
- **`describe('POST /users')`** — Valid-payload (2xx) and `it.each(invalidPayloads(CreateUserBody))` (422) cases for user creation.
- **`describe('POST /products')`** — Same valid/invalid pattern for `CreateProductBody`.
- **`describe('POST /orders')** — Same pattern; invalid cases conditionally skip reference-patching when the field under test is `items`.
- **`describe('POST /cart')** — Valid/invalid for `UpsertCartItemBody`; patches `productId` to a real product except when that field is the violation under test.
- **`describe('POST /feedback/contact')`** — Valid/invalid for `CreateFeedbackRequestBody`; no auth, no patching.
- **`describe('POST /account/signup')`** — Valid/invalid for `SignupBody`; applies both `withMatchingPasswordConfirm` and `withCompliantPassword`.

## Relationships

- **`tests/support/contract-data.ts`** — Source of `validPayload()` and `invalidPayloads()`, which introspect Zod schemas to generate legal and illegal payloads.
- **`tests/support/contract.ts`** — Imported via `@tests/contract`; registers the `toSatisfyApiSpec()` matcher used in every assertion.
- **`tests/support/http.ts`** — Provides `api()` (supertest wrapper) and `authenticateAs()` (returns a bearer token for a named role).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs once at module load to clear/prepare the test database.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct()` creates a real product document whose `_id` is patched into order and cart payloads.

## Notes

- **`skipField` is load-bearing.** Without it, `withRealOrderReferences` silently overwrites the field an invalid-payload case is testing (e.g. a "userId is missing" case would send a valid userId and pass), defeating the test.
- **Password complexity is invisible to the schema walker.** The spec carries the rule only in prose (a lookahead `pattern` breaks `fast-check`); `zodUserSchema` enforces it by hand. The introspection-based generator therefore can't produce a compliant password, so `withCompliantPassword` substitutes one.
- **Scope boundary:** this file asserts only contract-level 2xx/422 semantics. Business rules the schema cannot express (e.g. `quantity ≤ available`, `passwordConfirm === password`) are handled by the patching helpers here or by dedicated scenario tests elsewhere.
- **`.extend()` gotcha (noted in the header comment):** `zodProductSchema` overrides `price` for an i18n message and must restate `.min(0)`; forgetting to do so silently drops the contract's `minimum: 0`.
- **`imageUrl` uses `format: uri-reference`, not `uri`**, because it holds relative upload paths. Tightening the validator to match a `uri` format would reject every path the API itself produces.
