---
source: tests/integration/app/demo-routes.test.ts
sha256: 386989257fe47cb426fed157f2ab83bddd3d98dba125f29f36f98acea65f297b
generated_at: 2026-09-23T20:02:48.832270+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/app/demo-routes.test.ts

## Purpose

Integration tests for the two routes exposed by `installDemo` (`POST /__test/restore` and `GET /__test/emails`). Each test mounts those routes on a throwaway Express app (or the real app, for the mount-gate case) and asserts the HTTP status codes, body validation, and side-effects a caller actually sees—complementing the boolean-level unit tests in `demo-outbox.test.ts`.

## Key elements

- **`testApp()`** – Minimal Express app with `express.json()` + `installDemo` only. Sufficient for handler-level tests (validation, status codes) where no other API is needed.
- **`drivableApp()`** – Full-stack Express app mirroring `src/app.ts` install order (`installSecurity` → `installRequestContext` → `installDemo` → `installRoutes` → `installErrorHandling`). Required when the `shop` scenario drives real application flows (login, checkout) that would 404 on the minimal app.
- **`mockFailNextEmptyDatabase`** – One-shot arming object that makes the next `emptyDatabase()` call reject. Used to simulate a seed failure and verify a 500 is returned with the outbox left empty.
- **`describe('the mount gate')`** – Hits `POST /__test/restore` via `api()` (the real app) to prove a 404 is returned when `enableDemoProfile()` was never called.
- **`describe('POST /__test/restore')`** – Three cases: unknown scenario → 400; empty body → 204 + seeded products & orders; seeded failure → 500 + empty outbox.
- **`describe('GET /__test/emails')`** – Verifies the outbox endpoint returns `{ emails: [] }` on a fresh reset.

## Relationships

- **`src/app/demo.ts`** – Source of `installDemo`, the function under test.
- **`src/app/security.ts`** – `installSecurity` parses JSON bodies; without it the shop scenario's first login 500s.
- **`src/app/request-context.ts`** – `installRequestContext` installed in `drivableApp` for per-request state.
- **`src/app/routes.ts`** – `installRoutes` provides the full API surface the shop scenario flows hit.
- **`src/app/error-handling.ts`** – `installErrorHandling` ensures unhandled rejections surface as HTTP 500s.
- **`src/kernel/registry.ts`** – `resolveTranslatables` builds the translation manifest from `enabledModules`.
- **`src/modules.ts`** – Exports `enabledModules`, the set passed to `resolveTranslatables`.
- **`src/modules/locales/module.ts`** – `setTranslatables` registers (in `beforeAll`) and clears (in `afterAll`) the manifest the shop scenario's writes validate against.
- **`src/modules/products/model.ts`** – `productModel.countDocuments()` asserts the shop scenario actually seeded products.
- **`src/modules/orders/model.ts`** – `orderModel.countDocuments()` asserts the driven flows (login, checkout) completed.
- **`tests/support/http.ts`** – `api()` helper used to hit the real (ungated) app in the mount-gate test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` manages the test database lifecycle (snapshot/restore).

## Notes

- The `mockFailNextEmptyDatabase` object is named with the `mock` prefix because `jest.mock` is hoisted above imports and may only close over identifiers matching that convention (same pattern as `two-factor.test.ts`).
- The seed-failure test uses scenario `'blank'` rather than `'shop'` because `'shop'` is already cached by the preceding test; a cached restore skips `emptyDatabase()` and would not trigger the induced failure.
- The shop-scenario test has a 120 s timeout (`120_000`) because it drives the full application stack (login, checkout, ~200 writes).
- The mount-gate test intentionally uses `api()` (the real app) instead of `testApp()`, since `testApp()` calls `installDemo` directly and would bypass the gate being tested.
