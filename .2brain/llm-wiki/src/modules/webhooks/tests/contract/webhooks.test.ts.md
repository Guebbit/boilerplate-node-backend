---
source: src/modules/webhooks/tests/contract/webhooks.test.ts
sha256: 4d34f4e39843f93e48427c2473cba04e250b46910524f5c50ea07187e4c5f713
generated_at: 2026-09-27T15:45:15.082827+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/contract/webhooks.test.ts

## Purpose

Contract tests that exercise every `/webhooks` admin endpoint (subscriptions CRUD, secret rotation, delivery log, replay, and the public event catalogue) and assert the responses conform to the bundled `openapi.yaml`. They exist to catch API-shape drift before it reaches consumers.

## Key elements

- **`subscriptionBody(overrides?)`** — local factory returning a default subscription payload pointed at `https://example.test/inbox` so no real delivery ever occurs; tests spread overrides on top.
- **`describe('GET /webhooks/subscriptions')`** — verifies 401 (no auth), 403 (role without the webhooks key), and that listed items never expose `secret`/`newSecret` but do expose `secretIds[]`.
- **`describe('POST /webhooks/subscriptions')`** — happy-path (201, `whsec_` prefix, defaults), 422 for plain-`http://` URL, 422 for empty `eventTypes`, 403 for a role lacking the write key, and 422 once the subscription cap (`NODE_WEBHOOK_SUBSCRIPTION_CAP`) is hit.
- **`describe('PUT /webhooks/subscriptions/:id')`** — full-replace semantics: omitted `description` is cleared; missing required fields → 422; foreign id → 404.
- **`describe('PATCH /webhooks/subscriptions/:id')`** — partial-update semantics: omitted fields preserved; re-enabling clears `consecutiveFailures`/`disabledAt`; editing an already-enabled sub does **not** reset the failure streak.
- **`describe('POST /webhooks/subscriptions/:id/rotate-secret')`** — rotation returns `newSecret` and grows `secretIds` to length 2; foreign id → 404.
- **`describe('DELETE /webhooks/subscriptions/:id/secrets/:secretId')`** — unknown `secretId` → 404 without mutating the ring; deleting the last secret in the ring → 422.

## Relationships

- **`tests/support/contract.ts`** — imported as a bare side-effect (`@tests/contract`); registers OpenAPI validation so every response in this suite is schema-checked automatically.
- **`tests/support/http.ts`** — provides `api()` (supertest wrapper) and `authenticateAsRole()` used in every test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module level to give each run a clean database.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository` (and the imported `webhookDeliveryRepository`) are used directly inside tests to seed fixture state (e.g. setting `consecutiveFailures`, `disabledAt`, or inspecting the secrets ring) that is not reachable through the HTTP surface.

## Notes

- **PUT vs PATCH:** PUT is a full replace (omitted optional fields are cleared); PATCH is a partial update (omitted fields are untouched). Both are contract-locked here.
- **Failure-streak reset rule:** Only a transition from `enabled: false → true` resets `consecutiveFailures` and `disabledAt`. Re-sending `enabled: true` on an already-enabled subscription leaves the streak intact.
- **Cap test mutates `process.env`:** The subscription-cap test sets `NODE_WEBHOOK_SUBSCRIPTION_CAP` inline and restores it in a `finally` block; parallel test runners that share the process will see the mutation.
- **`@tests/contract` is a side-effect import:** No symbols are destructured; its sole job is to wire up OpenAPI response validation for the duration of the suite.
- **Secret ring invariant:** A subscription must always retain at least one active secret; the DELETE endpoint enforces this with a 422 rather than allowing an empty ring.
