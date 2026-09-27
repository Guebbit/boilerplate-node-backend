---
source: tests/integration/app/demo-routes.test.ts
sha256: 5ef087564fd08e6ffafbc086269ffee9169b01ab28673252d1221d8911568150
generated_at: 2026-09-27T15:54:39.718238+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/app/demo-routes.test.ts

## Purpose

Integration tests for the two demo routes (`POST /__test/restore`, `GET /__test/emails`) installed by `installDemo`. Most cases mount the routes on a throwaway Express app to isolate handler behaviour (body validation, status codes); one case hits the real `src/app.ts` via `@tests/http` to prove the mount gate returns 404 when `enableDemoProfile()` was never called.

## Key elements

- **`mockFailNextEmptyDatabase`** — one-shot flag; when `armed`, the next `emptyDatabase()` call rejects. Named `mock*` so the hoisted `jest.mock` can close over it (Jest hoisting constraint).
- **`jest.mock('@infrastructure/runtime/database-snapshot', …)`** — wraps the real module, conditionally overriding `emptyDatabase` for the seed-failure test.
- **`testApp()`** — minimal Express app with `express.json()` + `installDemo` only. Used for handler-level assertions.
- **`drivableApp()`** — Express app with the full middleware stack (`installSecurity`, `installRequestParsing`, `installRequestContext`, `installDemo`, `installRoutes`, `installErrorHandling`). Required because the default *shop* scenario drives real API calls (login, checkout, etc.) against the app it is handed.
- **`describe('the mount gate')`** — asserts 404 on `POST /__test/restore` via the real `api()` helper, confirming the gate rejects when the feature flag is off.
- **`describe('POST /__test/restore')`** — covers unknown scenario → 400, empty body → 204 + DB verification, forced `emptyDatabase` failure → 500 + outbox intact.
- **`describe('GET /__test/emails')`** — asserts 200 with `{ emails: [] }` on a fresh outbox.

## Relationships

- **`src/app/demo.ts`** — source of `installDemo`, the function under test.
- **`src/app/security.ts`** — provides `installSecurity` and `installRequestParsing`, required for the drivable app to parse JSON bodies.
- **`src/app/request-context.ts`** — `installRequestContext`, part of the drivable app middleware chain.
- **`src/app/routes.ts`** — `installRoutes`, registers the real API routes that the *shop* scenario exercises.
- **`src/app/error-handling.ts`** — `installErrorHandling`, final middleware in the drivable app.
- **`src/modules/products/model.ts`** — `productModel` used to assert seeded product documents.
- **`src/modules/orders/model.ts`** — `orderModel` used to assert that checkout flows actually ran.
- **`tests/support/http.ts`** — `api` helper; pulls in the real `src/app.ts` for the mount-gate case and registers all modules (including `products`' translatables) at import time.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` called at module scope to configure the test database.

## Notes

- The *shop* scenario test carries a **120 s** timeout because it drives the full application (login, cart, checkout, ~200+ requests) rather than a single handler call.
- The seed-failure test intentionally uses `scenario: 'blank'` (not `'shop'`) to avoid the per-test caching that would skip the second `emptyDatabase()` call.
- `testApp()` does **not** include `installRequestParsing`; JSON bodies in those cases arrive pre-parsed by `express.json()`. The drivable app relies on `installRequestParsing` instead — omitting it would 500 on the first login the *shop* flow performs.
- The file deliberately does **not** import `src/app.ts` directly; the only real-app access is through `@tests/http` in the mount-gate case, preserving handler isolation for every other test.
