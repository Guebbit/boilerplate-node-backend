# src/modules/orders/tests/contract/api.contract.test.ts

## Purpose

HTTP-level contract tests for every `/orders` route. Each response is validated against the OpenAPI spec via the `toSatisfyApiSpec()` matcher, so any drift between what the server actually returns and what the published contract promises is caught here. The file also asserts role-specific behavior (admin vs. scoped user) that unit-level repository tests cannot see, because the divergence lived in the transform layer between the two code paths.

## Key elements

- **`seedOrderFor(user)`** – local helper that creates a product and a two-item order for the given user, used as the canonical fixture across every test block.
- **`GET /orders` block** – verifies filter params (`status`, `notes`), the three-field total shape (`totalItems`, `totalQuantity`, `totalPrice`; explicitly asserts *absence* of a singular `total` key), and contract conformance for both admin and non-admin callers.
- **`GET /orders/{id}` block** – contract conformance on both the admin `findById` path and the non-admin aggregate path; 404 on malformed ObjectId for each role; invoice sub-route 404 on malformed id; scoped access (stranger gets 404, admin gets 200 + `application/pdf`).
- **`POST /orders/{id}/cancel` block** – owner cancel, admin cancel of another's order, stranger gets 404 (no existence leak), non-pending order returns 409 with `ORDER_NOT_CANCELLABLE`, and a duplicate cancel returns 409 rather than a double write.
- **`jest.mock('@infrastructure/adapters/pdf')`** – stubs `renderHtmlToPdf` to avoid a real Chromium dependency; only the route's status/header contract is under test, not PDF content.

## Relationships

- **`src/modules/orders/index.ts`** – provides `orderRepository`, used directly to transition order status (`updateStatusIfIn`) so tests can set up paid/shipped states without going through the HTTP API.
- **`src/modules/orders/tests/fixtures.ts`** – `createOrder` and `toOrderItem` are the primary data-seeding helpers.
- **`src/modules/products/tests/fixtures.ts`** – `createProduct` supplies the line-item target for every order.
- **`src/modules/users/tests/fixtures.ts`** – `createUser` and `PLAIN_PASSWORD` are used to mint a "stranger" account for the cross-user access-denial tests.
- **`tests/support/contract.ts`** – registers the `toSatisfyApiSpec()` jest matcher that validates every response body against `openapi.yaml`.
- **`tests/support/http.ts`** – `api()` (supertest wrapper) and `authenticateAs(role)` (bearer-token helper) are the sole HTTP entry points for every request in this file.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called once at module scope to reset and seed the database before any test runs.

## Notes

- The file's module docstring records the historical bug that motivated it: the list endpoint returned three total fields while `openapi.yaml` declared one `total`, and `GET /orders/{id}` shaped its payload differently per caller role. Both went uncaught because no prior test crossed the HTTP boundary.
- Status transitions in tests go through `orderRepository.updateStatusIfIn` rather than a `POST` to the API — the comment explicitly justifies this: "a status the application cannot arrive at is not one worth filtering for."
- The "absence, not refusal" convention: when a non-admin accesses another user's order (cancel or invoice), the response is **404**, not 403. The stranger cannot distinguish "doesn't exist" from "exists but not mine."
- The PDF adapter is mocked identically to `invoice-locale.test.ts`; the test environment has no Chromium.
