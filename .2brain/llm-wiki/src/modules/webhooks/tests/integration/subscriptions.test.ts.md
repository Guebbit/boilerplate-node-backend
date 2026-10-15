---
source: src/modules/webhooks/tests/integration/subscriptions.test.ts
sha256: e310e91ccc092a5c4f05b9eee2b335e9fbe289bb7f869aae6f2b683e4bfa9b12
generated_at: 2026-10-15T12:24:22.071339+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/subscriptions.test.ts

## Purpose

Integration test for the `create` service in `services/subscriptions.ts`. It verifies two behaviours that a unit test with a mocked repository cannot: (1) the race-guard re-check that prevents two truly concurrent writes from both succeeding at the subscription cap, and (2) that `ownerUserId` is persisted on the row but stripped from the API response. A real database (`setupTestDb`) is required because the race scenario depends on two transactions landing at the same instant.

## Key elements

- **`setupTestDb()`** — spins up a real (in-memory) Mongo instance so concurrent inserts exercise actual transaction/rollback semantics.
- **`subscriptionBody(url)`** — small helper that returns `{ url, eventTypes: ['*'] }`.
- **`describe('create — the subscription cap boundary')`** — sets `NODE_WEBHOOK_SUBSCRIPTION_CAP=1` in `beforeEach`, fires two `create` calls via `Promise.all`, asserts exactly one succeeds (HTTP 200) and one returns `422` with the "reached its webhook subscription limit" message. Then queries the repository to confirm only one row persisted (the loser was rolled back).
- **`describe('create — captures the owner id')`** — two cases: (a) a real user created via `createUser` is the caller; asserts `ownerUserId` is stored in the DB but absent from `result.data.subscription.toJSON()`. (b) the default `'test-user'` id from `callerAs('manager')` is stored verbatim without any lookup, proving creation never resolves the id.

## Relationships

- **`tests/support/setup-test-db.ts`** → `setupTestDb()` provides the real database connection for the entire file.
- **`src/modules/webhooks/services/subscriptions.ts`** → `create` is the unit under test; both `describe` blocks exercise it directly.
- **`src/modules/webhooks/repository.ts`** → `webhookSubscriptionRepository` is queried post-hoc to assert stored row count and `ownerUserId` field.
- **`tests/support/callers.ts`** → `callerAs` builds the caller identity; `TEST_TENANT_ID` scopes repository queries to the test tenant.
- **`src/modules/users/tests/factories.ts`** → `createUser` creates a real user document so the owner-id test has a genuine ObjectId.
- **`tests/support/environment.ts`** → `setEnvironment` injects `NODE_WEBHOOK_SUBSCRIPTION_CAP` before each cap-boundary test.

## Notes

- The file deliberately avoids mocking the repository. The race-guard test is the "reason to exist" of the post-insert re-check in `create`; a mocked repo would always return the same canned count and could not reproduce two writers reading `0` simultaneously.
- After the `expect(succeeded).toHaveLength(1)` guard, a `throw new Error('unreachable')` follows the `if (rejected[0]?.success)` check to satisfy TypeScript's control-flow narrowing — a convention used throughout this file.
- The owner-id test relies on the transform in `../../model.ts` (`applyWebhookSubscriptionTransform`) to strip `ownerUserId` from the wire response; the test asserts its absence on the serialised object rather than on the raw DB document.
- `beforeEach` sets the cap to `1`, so the cap-boundary test runs in isolation from any residual subscriptions in the test DB.
