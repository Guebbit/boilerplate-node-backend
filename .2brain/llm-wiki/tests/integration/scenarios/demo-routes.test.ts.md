---
source: tests/integration/scenarios/demo-routes.test.ts
sha256: d9754b28d14c29fe5d585f661c6fe1fadefcab25305fc249ef34a084b85db267
generated_at: 2026-10-15T12:53:08.405476+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/demo-routes.test.ts

## Purpose

Integration tests for the demo/test-surface routes installed by `installDemo`. Verifies that production has no such surface (404), that each route handler returns correct status codes and bodies for valid and invalid input, and that side-effects (seeding, job execution, clock manipulation, outbox) behave as documented. Uses two throwaway Express apps rather than the real `src/app.ts` for most cases, switching to the full app only where the `shop` scenario must drive real API calls.

## Key elements

- **`testApp()`** – Minimal Express app with `express.json()` + `installDemo(app)`. Used by every case whose subject is a route handler in isolation.
- **`drivableApp()`** – Express app with the full middleware chain (`installSecurity`, `installRequestParsing`, `installRequestContext`, `installDemo`, `installRoutes`, `installErrorHandling`) in the same order as `src/app.ts`. Required for the `shop` restore test, which issues real API calls (login, checkout, etc.) against the app.
- **`mockFailNextEmptyDatabase`** – One-shot flag that makes the next `emptyDatabase()` call reject. Named with the `mock` prefix because `jest.mock` hoisting restricts closure identifiers to that prefix.
- **`stubClock()`** – In-memory `DemoClock` implementation that records `advance` calls and `reset` counts; used to assert clock-route behaviour without real time.
- **`jest.mock('@scenarios/support/database-snapshot')`** – Wraps the real module, overriding only `emptyDatabase` to reject when the flag is armed.
- **Test groups** – `production has no demo surface`, `POST /__test/restore`, `POST /__test/jobs/:name`, `GET /__test/emails`, `/__test/clock`.

## Relationships

- **`scenarios/support/demo.ts`** – Source of `installDemo`, the route installer under test.
- **`scenarios/support/demo-clock.ts`** – Provides `registerDemoClock` / `DemoClock` type; the `/__test/clock` tests install and assert against a stub clock via this module.
- **`src/app/security.ts`** – `installSecurity` and `installRequestParsing` are wired into `drivableApp()` to replicate production middleware.
- **`src/app/request-context.ts`** – `installRequestContext` is part of the `drivableApp()` chain.
- **`src/app/routes.ts`** – `installRoutes` mounts the real API routes in `drivableApp()` so the `shop` scenario's internal calls (login, checkout) resolve.
- **`src/app/error-handling.ts`** – `installErrorHandling` gives `drivableApp()` the same error middleware as production.
- **`src/modules/products/model.ts`** – `productModel` is queried to assert the `shop` seed actually wrote products.
- **`src/modules/orders/model.ts`** – `orderModel` is queried to assert orders were created and to inspect scrubbed fields after `reap-orders`.
- **`src/modules/users/tests/factories.ts`** – `createUser` seeds a user for the `reap-orders` tests.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds a product referenced by test orders.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `detachOrderUserId` build and age an order for the retention-window tests.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the test database before the suite runs.
- **`tests/support/http.ts`** – `api()` is used by the "production has no demo surface" case to hit the real `createApp()`; importing it also pulls in `src/app.ts` at module-load time, which registers all enabled modules (including products' `translatables`).
- **`tests/support/file-sandbox.ts`** – `emptyFileSandbox` is called in `afterAll` to clean up any file uploaded through the demo routes.

## Notes

- The `mockFailNextEmptyDatabase` identifier **must** keep the `mock` prefix; `jest.mock` hoists the factory above all imports and will throw if it closes over an identifier that doesn't match.
- The `emptyDatabase` failure test uses `scenario: 'blank'` rather than `'shop'` because `shop` is already cached by a preceding test and a cached restore never calls `emptyDatabase()` again.
- `drivableApp()` installs `installRequestParsing` explicitly; without it the `shop` scenario's first `POST /account/login` 500s because the JSON body is never parsed.
- The `api()` import from `@tests/http` has a side-effect: importing it loads the real `src/app.ts`, which registers every enabled module (including `products`' `translatables` declaration) at import time. No test in this file manually builds that lookup.
- The `/__test/clock` tests register a stub clock and clean up with `registerDemoClock(undefined)` in `afterEach`.
