---
source: tests/integration/journeys/an-integrator-start-to-finish.test.ts
sha256: 299b85bc4f463477d17337a9c918518dd1808244134febf4867482f219e7e887
generated_at: 2026-11-14T23:15:17.091146+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/journeys/an-integrator-start-to-finish.test.ts

## Purpose

End-to-end integration test that walks the full lifecycle a third-party integrator experiences: an admin mints an API key, the integrator subscribes a webhook to all events, a customer performs every shop action (buy → decline → pay → ship → deliver → return → cancel), and the test asserts each webhook arrives exactly once, signed, in causal order. It also verifies that revoking the key immediately kills access, and that a key's permissions track its minter's role/status.

## Key elements

- **`it('delivers every event once, signed, in causal order')`** — The main journey. Mints a key, subscribes with `eventTypes: ['*']`, then drives an order through payment failure, payment success, shipping, delivery, return, and a second order cancellation. After each action it calls `arrivals()` and asserts the exact set of event types that step produced. Finally checks all payloads are signed, all IDs are unique (11 total), and revokes the key expecting 401.
- **`arrivals()` (local async fn)** — Drains the `sweep:webhook-retries` queue, then slices the receiver's recorded deliveries past the high-water mark `seen` and returns the new event types sorted.
- **`inAWeek()`** — Returns an ISO timestamp 7 days out; used as `expiresAt` for minted keys.
- **`adminWithKey(n)`** — Creates a verified admin user, logs in, mints a key with only `read:WebhookSubscription`, and returns `{ user, key }`. Used by the "key follows its minter" suite.
- **`describe('a key follows its minter')`** — Two sub-assertions: demoting a minter to `editor` makes their key return **403** (credential valid, rule missing); deactivating a minter makes their key return **401** (credential no longer resolves).

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` at top level provisions an isolated database before any test runs.
- **`tests/support/http.ts`** — `api()` (supertest client), `authenticateAs('admin')`, and `loginBearer(email)` are the sole HTTP/auth entry points.
- **`tests/support/body-of.ts`** — `bodyOf(response, zodSchema)` parses and type-narrows every JSON response.
- **`tests/support/drain.ts`** — `drain('sweep:webhook-retries')` flushes the webhook retry queue so `arrivals()` sees the final set.
- **`tests/support/webhook-receiver.ts`** — `startWebhookReceiver()` (imported with the `WebhookReceiver` type) spins up a local HTTP server that records signed webhook deliveries; the returned receiver instance is inspected for recorded events and stopped in `afterEach`.
- **`tests/support/journey-orders.ts`** — `newShopper()`, `placeOrder()`, `openIntent()`, `confirmCard()` encapsulate the customer-side purchase flow.
- **`tests/support/contract.ts`** — Imported for side-effect: registers global contract assertions that validate every response against its OpenAPI/zod schema.
- **`src/modules/users/tests/factories.ts`** — `createUser()` creates admin users with specific roles for the key-follows-minter suite.
- **`src/modules/products/tests/factories.ts`** — `createProduct()` creates the "dog food" product used in both orders.

## Notes

- The wildcard subscription (`eventTypes: ['*']`) requires the API key to carry **each event's read/display permission** individually (`display:Order`, `read:Return`, etc.). Omitting any one silently drops that event from delivery.
- Replay/webhook-retry is **explicitly out of scope** here (see file header comment); it is covered by the frontend's journey tests.
- The `afterEach` stops the webhook receiver defensively (`receiver?.stop()`), so a mid-test failure won't leak the server.
- Banned-minter key → **401** vs. demoted-minter key → **403** is an intentional distinction: 401 means the credential itself is unresolvable; 403 means the credential resolved but the caller lacks the rule.
- `arrivals()` uses `.toSorted()` (non-mutating) so the shared recorded-deliveries array is not reordered.
