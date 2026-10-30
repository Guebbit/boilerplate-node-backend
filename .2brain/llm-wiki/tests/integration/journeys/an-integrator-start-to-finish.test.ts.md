---
source: tests/integration/journeys/an-integrator-start-to-finish.test.ts
sha256: af038d4e5dd90147ad4d699db548282bb293fc4446c66244062ed0fc97d5e585
generated_at: 2026-10-29T06:56:41.353291+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/an-integrator-start-to-finish.test.ts

## Purpose

End-to-end integration test that walks a complete integrator lifecycle: an admin mints a scoped API key, the integrator subscribes a webhook endpoint to all events, a shopper then triggers the full order lifecycle (create, payment decline, payment success, ship, deliver, return, cancel) while a background sweep delivers webhooks after each action. The test asserts every event arrives exactly once, is HMAC-signed, and appears in causal order. A secondary describe block verifies that a minted key's effective permissions follow its minter's role and account status.

## Key elements

- **`it('delivers every event once, signed, in causal order')`** — The main scenario. Mints a key, creates a webhook subscription, drives two orders through their full lifecycle, drains the sweep after each step, and asserts the exact ordered list of 11 event types, universal signing, and no duplicate deliveries.
- **`describe('a key follows its minter')`** — Verifies that demoting a minter (403) and banning one (401) change the minted key's access without modifying the key itself.
- **`adminWithKey(n)`** — Creates a verified admin user, logs in, mints a `read:WebhookSubscription` key, and returns the user record plus bearer string.
- **`inAWeek()`** — Returns an ISO timestamp 7 days out, used as the `expiresAt` for minted keys.
- **`arrivals()`** (closure) — Drains the `sweep:webhook-retries` job, slices the receiver's log past a `seen` cursor, and returns the sorted event-type names for the step just completed.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initializes (or resets) the test database before any test runs.
- **`tests/support/http.ts`** — `api()`, `authenticateAs()`, and `loginBearer()` supply the Supertest-based HTTP client and auth helpers used throughout.
- **`tests/support/body-of.ts`** — `bodyOf()` validates a response body against a Zod schema and extracts the typed payload.
- **`tests/support/contract.ts`** — Imported as a side-effect module; establishes contract-test globals or assertions used by `bodyOf` and the API layer.
- **`tests/support/drain.ts`** — `drain('sweep:webhook-retries')` blocks until the pending webhook-delivery sweep has completed, guaranteeing deterministic arrival checks.
- **`tests/support/webhook-receiver.ts`** — `startWebhookReceiver()` spins up a local HTTP server that records incoming webhook payloads; `WebhookReceiver` exposes `url`, `received(secrets)`, and `stop()`.
- **`tests/support/journey-orders.ts`** — `newShopper`, `placeOrder`, `openIntent`, and `confirmCard` encapsulate the shopper-facing order and payment flow steps.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds a product with a given price and stock so the order can be placed.
- **`src/modules/users/tests/factories.ts`** — `createUser` provisions a user with a specific role and verified timestamp for the minter-identity tests.

## Notes

- **Drain-before-assert pattern:** Every `arrivals()` call must be preceded (internally) by `drain('sweep:webhook-retries')`. Skipping this would make the arrival list flaky because delivery is asynchronous.
- **Sorted per-step, ordered across steps:** Within a single step, event names are compared as a sorted array (e.g. `['order.paid', 'payment.succeeded']`), but the *sequence of steps* is strict. This allows multiple events fired by one action in any internal order while enforcing causal ordering between actions.
- **11 unique event types:** The final assertion (`Set` size of `type` = 11) catches both missing events and accidental duplicates.
- **401 vs 403 semantics:** A banned minter's key returns **401** (the credential no longer resolves to a user), while a demoted minter's key returns **403** (the user exists but lacks the required permission). This distinction is intentional and asserted.
- **Replay is out of scope:** The module docstring explicitly defers webhook replay testing to the frontend journey tests.
