---
source: tests/integration/scenarios/demo-routes.test.ts
sha256: 4073587653d20d96832a0612946257dc630048a1a2ddf67e56cf739b8bbbf2dd
generated_at: 2026-10-29T07:02:20.860374+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/demo-routes.test.ts

## Purpose

Integration tests for the `/__test/*` lever routes installed by `installDemo`. The file proves two things: (1) the production app exposes none of these routes, and (2) when the routes *are* mounted on a throwaway Express app, their handlers validate bodies, return the correct status codes, and produce the expected side effects (seed data, job execution, payment-refund failures, disputes).

## Key elements

- **`testApp()`** – Builds a minimal Express app with only `express.json()` + `installDemo(app, resolveJobs(enabledModules))`. Used by most cases whose subject is the handler itself.
- **`drivableApp()`** – Adds the full middleware chain (`installSecurity`, `installRequestParsing`, `installRequestContext`, `installRoutes`, `installErrorHandling`) around `installDemo`. Required because building the `shop` scenario drives real API calls (login, checkout, etc.) that a bare `testApp()` would 404.
- **`mockFailNextEmptyDatabase`** – A one-shot `{ armed: false }` flag. When armed, the next call to `emptyDatabase()` *or* `restoreDatabaseCopy()` rejects with a synthetic error, then self-disarms. Used to simulate a seed failure.
- **`jest.mock('@scenarios/support/database-snapshot', …)`** – Factory mock that wraps the real module, injecting the one-shot rejection. The variable name must start with `mock` (Jest hoisting constraint).
- **`afterEach` / `afterAll` hooks** – Un-arm the mock so a leftover flag can't poison the next scenario; tear down the file-sandbox (shop scenario uploads a product image via a real route).
- **`attemptRefund(providerRef)`** – Thin wrapper around `fakePaymentProvider.refund` with fixed idempotency/refund IDs for deterministic assertions.
- **Test groups** – `describe` blocks for: production 404, `POST /__test/restore`, `GET /__test/jobs`, `POST /__test/jobs/:name`, `POST /__test/payments/refund-failure`, `POST /__test/payments/dispute`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/support/demo.ts` | Source of `installDemo`, the routes under test. |
| `scenarios/support/demo-clock.ts` | Provides `registerDemoClock` / `DemoClock` type (imported for clock control during scenario builds). |
| `scenarios/support/doubles/payments/fake.ts` | `fakePaymentProvider` is called directly in refund-failure tests to verify the lever actually blocks/allows refunds. |
| `src/app/security.ts` | `installSecurity` and `installRequestParsing` installed in `drivableApp()`. |
| `src/app/request-context.ts` | `installRequestContext` installed in `drivableApp()`. |
| `src/app/routes.ts` | `installRoutes` installed in `drivableApp()`. |
| `src/app/error-handling.ts` | `installErrorHandling` installed in `drivableApp()`. |
| `src/kernel/registry.ts` | `resolveJobs` converts module job declarations into the map handed to `installDemo`. |
| `src/modules.ts` | `enabledModules` is the input to `resolveJobs`. |
| `src/modules/products/model.ts` | `productModel.countDocuments()` asserts the shop seed populated products. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds test fixtures. |
| `src/modules/orders/model.ts` | `orderModel` used for count and PII-scrub assertions. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem`, `detachOrderUserId` build order fixtures. |
| `src/modules/payments/model.ts` | `paymentModel.findOne` asserts refund/dispute state. |
| `src/modules/payments/tests/factories.ts` | `payByCard` creates a completed payment to exercise refund/dispute levers. |

## Notes

- **`drivableApp()` exists for exactly one reason:** the `shop` scenario drives ~200 real API calls (login, checkout, …) against whatever app `installDemo` was handed. Without the full middleware chain those calls 500 on the first JSON-parse step.
- **`mockFailNextEmptyDatabase` naming:** Jest hoists `jest.mock` calls above all imports, so the factory may only close over identifiers prefixed `mock`. Renaming this variable to something else will break at runtime.
- **The production-404 case uses `api()` (the real app)**, not `testApp()`. Using `testApp()` would be circular—it *does* call `installDemo`.
- **`POST /__test/jobs/constructor`** is a regression guard: the job lookup must use `hasOwnProperty` (or equivalent), not the `in` operator, to avoid matching inherited prototype keys.
- **`reap-orders` test** asserts PII scrubbing: the order's `email` field is replaced with `anonymized@deleted.invalid` after the job runs.
- **120 s timeout** on the `shop` default-body test reflects the cost of driving the full application flow (login → cart → checkout → …).
