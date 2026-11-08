---
source: tests/integration/scenarios/demo-routes.test.ts
sha256: 4756c29362fbc6346caa1a1c3dd40e032ef49f3eb88dcbf14f08ff856085a4a3
generated_at: 2026-11-08T09:47:20.829163+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/scenarios/demo-routes.test.ts

## Purpose

Integration tests for the `/__test/*` demo endpoints mounted by `installDemo` (from `scenarios/support/demo.ts`). The file verifies three things: (1) the real production app does **not** expose these routes, (2) each route handler returns the correct status code and body for valid/invalid input, and (3) side-effectful behavior (rate-limit reset, job execution, payment-refund injection) actually takes effect on the database or in-memory stores.

## Key elements

- **`testApp()`** – Minimal Express app carrying only the demo routes (`installDemo` + `resolveJobs(enabledModules)`). Used by every case whose subject is the handler itself.
- **`drivableApp()`** – Express app with the full production middleware stack (`installSecurity`, `installRequestParsing`, `installRequestContext`, `installRoutes`, `installErrorHandling`) plus the demo routes. Required only for the `shop` scenario, which drives real application flows (login, checkout) against the app.
- **`spentStore(escalation?)`** – Builds a `rateLimitStore` with a 10-minute window so counters persist for the duration of the test; optionally configures escalation.
- **`mockFailNextEmptyDatabase`** – One-shot flag + `jest.mock` of `database-snapshot` that makes the next `emptyDatabase` or `restoreDatabaseCopy` call reject, simulating a seed failure.
- **`attemptRefund(providerRef)`** – Thin wrapper around `fakePaymentProvider.refund` with fixed test parameters, used to assert that a refund-failure injection blocks/succeeds the refund.
- **Describe blocks** – Cover `POST /__test/restore` (400 unknown scenario, 204 default shop, 500 seed failure, rate-limit reset), `GET /__test/jobs`, `POST /__test/jobs/:name` (404 unknown, 404 prototype property, `reap-orders` behavior), `POST /__test/payments/refund-failure`, and `POST /__test/payments/dispute`.

## Relationships

- **`scenarios/support/demo.ts`** – Provides `installDemo`, the function under test; this file asserts the contract of every route it registers.
- **`scenarios/support/doubles/payments/fake.ts`** – Supplies `fakePaymentProvider`, the in-memory double whose `refund` method is used to verify that the refund-failure injection actually changes refund behavior.
- **`scenarios/support/demo-clock.ts`** – Imported (`registerDemoClock`) for time control in scenarios that depend on wall-clock logic.
- **`src/app/security.ts`, `src/app/request-context.ts`, `src/app/routes.ts`, `src/app/error-handling.ts`** – The same install functions `src/app.ts` uses; `drivableApp()` composes them in production order so the `shop` scenario can exercise real flows.
- **`src/kernel/registry.ts` / `src/modules.ts`** – `resolveJobs(enabledModules)` resolves the job list passed to `installDemo`; the `GET /__test/jobs` test asserts the returned names match the enabled modules' declarations.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** – `rateLimitStore` is the store whose counters the limiter-reset tests increment and then verify are cleared.
- **`src/modules/orders/model.ts`, `src/modules/payments/model.ts`, `src/modules/products/model.ts`** – Mongo models used to assert post-condition state (counts, field values).
- **`src/modules/orders/tests/factories.ts`, `src/modules/payments/tests/factories.ts`, `src/modules/products/tests/factories.ts`** – Seed factories that create test fixtures (users, products, orders, payments) before exercising the routes.

## Notes

- The `mockFailNextEmptyDatabase` identifier **must** be prefixed `mock*` — `jest.mock` is hoisted above imports and may only close over `mock`-prefixed bindings. This is a hard Jest constraint, not a convention.
- `drivableApp()` exists for exactly one case (the `shop` default scenario). The `shop` build issues ~200+ real HTTP calls (login, checkout, etc.) through the app it was handed, so a bare `testApp()` would 500 on the first unhandled route.
- The "production has no demo surface" test deliberately uses `api()` (which imports the real `src/app.ts`) rather than `testApp()`, because the whole point is that a plain `createApp()` does not call `installDemo`.
- The `shop` restore test has a 120 s timeout — it drives a full application session, not a single HTTP call.
- `afterEach` disarms `mockFailNextEmptyDatabase` so a skipped or failed case cannot poison the next scenario build.
