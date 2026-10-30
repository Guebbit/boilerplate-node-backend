---
source: src/modules/webhooks/tests/integration/subscriptions.test.ts
sha256: 1c42a0bbeb3f10537c624d72c1ede252683e942a4e2f4fe92ae9fc366c90148d
generated_at: 2026-10-29T06:32:48.369984+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/subscriptions.test.ts

## Purpose

Integration test proving two things about `create` in the subscriptions service: (1) the post-insert rank re-check correctly rejects a second writer when the tenant cap is 1 and both inserts race, and (2) the creating caller's id is persisted as `ownerUserId` without being resolved or exposed on the wire. These tests require a real database because a mocked repository cannot reproduce two concurrent writers landing at the same instant.

## Key elements

- **`describe('create — the subscription cap boundary')`** — Sets `NODE_WEBHOOK_SUBSCRIPTION_CAP` to `'1'` via `setEnvironment`, then fires two `create` calls concurrently with `Promise.all`. Asserts exactly one succeeds and one returns `409` with `WEBHOOK_SUBSCRIPTION_LIMIT_REACHED`, and that the loser's row is rolled back (only 1 stored item).
- **`describe('create — captures the owner id')`** — Two tests: one creates a real user via `createUser` and verifies `ownerUserId` is stored but absent from the serialized response; another uses the default `callerAs('manager')` id (`'test-user'`) to confirm the id is stored verbatim with no resolution at creation time.
- **`subscriptionBody(url)`** — Local helper that returns the standard `{ url, eventTypes: ['*'] }` payload.

## Relationships

- **`src/modules/webhooks/services/subscriptions.ts`** — The `create` function is the unit under test in every case.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository.search` and `.findById` are used to inspect the stored row after each operation (cap rollback, owner-id persistence).
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module level to provision a real database for the race-condition test.
- **`tests/support/callers.ts`** — `callerAs` builds the caller identity; `TEST_TENANT_ID` scopes repository queries to a single tenant.
- **`tests/support/environment.ts`** — `setEnvironment` sets `NODE_WEBHOOK_SUBSCRIPTION_CAP` in each `beforeEach`.
- **`src/modules/users/tests/factories.ts`** — `createUser` mints a real user document so the owner-id test can use a genuine ObjectId.

## Notes

- This file is deliberately an **integration** test (real DB) rather than a unit test: the header comment states explicitly that a mocked repository cannot reproduce two writers inserting at the same instant, which is the entire point of the post-insert re-check.
- The cap is set to **1** to make the race deterministic with only two concurrent calls.
- `ownerUserId` is a **pointer stored unresolved** — no user-lookup happens at creation. Resolution (if any) is deferred to `services/attempt.ts` at notice-send time.
- The `if (!result.success) throw new Error('unreachable…')` pattern is a TypeScript type-narrowing guard after an `expect(result.success).toBe(true)` assertion; it is not a runtime branch.
- The default `callerAs('manager')` id (`'test-user')` is intentionally not a valid ObjectId — the test documents that this is harmless under the pointer design.
