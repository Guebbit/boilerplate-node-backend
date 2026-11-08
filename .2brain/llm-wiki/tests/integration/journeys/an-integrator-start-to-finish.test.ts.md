---
source: tests/integration/journeys/an-integrator-start-to-finish.test.ts
sha256: bcbfb41b06745fd3b9eb153c53aa1df4738686e774558d5b8fb363423abfbb4f
generated_at: 2026-11-08T09:40:00.164986+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/an-integrator-start-to-finish.test.ts

## Purpose

End-to-end integration test that walks a single integrator's full lifecycle: an admin mints an API key, the integrator subscribes a webhook to all events, a customer then performs a series of order/payment/shipping/return/cancel actions, and the test asserts the webhook endpoint received each event exactly once, signed, in causal order. A second block verifies that a minted key inherits its minter's permission changes (403 on demotion, 401 on deactivation).

## Key elements

- **`it('delivers every event once, signed, in causal order', …)`** — The main test. Mints a key, creates a webhook subscription, drives Order A (place → declined card → good card → ship → deliver → return → receive → refund) and Order B (place → cancel), then asserts the exact sorted event-type sequence per step, that every payload is signed, that IDs are unique, and that 11 distinct types were delivered. Finally revokes the key and confirms 401.
- **`adminWithKey(n)`** — Helper that creates a fresh admin user via `createUser`, logs in, and mints a `read:WebhookSubscription` key with a one-week expiry. Returns the user record and the Bearer key string.
- **`describe('a key follows its minter')`** — Verifies permission inheritance: demoting the minter to `editor` causes the key to get 403; deactivating the minter causes 401.
- **`afterEach`** — Stops the webhook receiver started by the main test to avoid leaking listeners.
- **`inAWeek()`** — Returns an ISO timestamp 7 days out, used as the `expiresAt` for minted keys.
- **`arrivals()` (local)** — Drains the `sweep:webhook-retries` queue, then returns only newly-received (post-`seen`) event type names, sorted.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to configure a clean test database.
- **`tests/support/contract.ts`** — Imported for global API request/response contract enforcement.
- **`tests/support/http.ts`** — Provides `api()`, `authenticateAs()`, and `loginBearer()` used for every HTTP call and auth setup.
- **`tests/support/body-of.ts`** — `bodyOf` unwraps and Zod-validates response bodies before the test reads fields from them.
- **`tests/support/drain.ts`** — `drain('sweep:webhook-retries')` flushes pending retry jobs so webhook deliveries are observable before assertions.
- **`tests/support/webhook-receiver.ts`** — `startWebhookReceiver` spins up a local HTTP server that records incoming webhook calls; `endpoint.received([secret])` returns the captured events; `endpoint.stop()` tears it down.
- **`tests/support/journey-orders.ts`** — `newShopper`, `placeOrder`, `openIntent`, `confirmCard` encapsulate the customer-facing order/payment steps.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds the product that gets ordered.
- **`src/modules/users/tests/factories.ts`** — `createUser` creates the admin minters in the permission-inheritance test.

## Notes

- **Replay is explicitly out of scope** here; the file's docstring defers it to the frontend's journeys.
- Event-order assertions use `toSorted()` on the type array per step, so within a single step the order is alphabetical, not causal. Causal ordering is asserted *across* steps (the `steps` array).
- `drain('sweep:webhook-retries')` must be called before reading arrivals; without it, async retry delivery may not have completed and the test will flake.
- The 403-vs-401 distinction in the "key follows its minter" test is intentional: a demoted user still *resolves* (so it's an authorization failure) whereas a deactivated user does not (so it's an authentication failure).
- The test uses `@tests/` path aliases throughout; ensure the project's tsconfig/vitest config maps these.
