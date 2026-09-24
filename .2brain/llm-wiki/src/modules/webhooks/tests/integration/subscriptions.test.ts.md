---
source: src/modules/webhooks/tests/integration/subscriptions.test.ts
sha256: e7cebfa89aaf8cb9f83dad265f50e35fbe3026e453ceaf88203f4bd80a45f922
generated_at: 2026-09-23T19:44:25.452027+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/subscriptions.test.ts

## Purpose

Integration test for `services/subscriptions.ts`'s `create` function, specifically targeting behaviors that only manifest against a **real database**: the subscription-cap race guard (two concurrent writers at cap = 1) and the persistence of `ownerUserId`. It exists because a mocked repository cannot reproduce two inserts landing at the same instant, which is the sole reason the post-insert rank re-check in `create` exists.

## Key elements

- **`describe('create — the subscription cap boundary')`** — Sets `NODE_WEBHOOK_SUBSCRIPTION_CAP=1`, fires two `Promise.all` creates, asserts exactly one succeeds (HTTP 200) and one gets `422`, then verifies via `webhookSubscriptionRepository.search` that only one row remains (rollback cleaned up the loser).
- **`describe('create — captures the owner id')`** — Verifies that `ownerUserId` is persisted in the DB but **absent** from the serialized response (the wire transform strips it). A second case confirms the stored value is whatever string the caller carries (e.g. `'test-user'`) without any resolution/lookup at creation time.
- **`subscriptionBody(url)`** — Local helper that shapes the `{ url, eventTypes: ['*'] }` payload.
- **`context`** — Module-level default caller context (`callerAs('manager')`, `analyticsConsent: false`).
- **Env-var save/restore** — `beforeEach`/`afterEach` snapshot and restore `NODE_WEBHOOK_SUBSCRIPTION_CAP` so the test is self-contained.

## Relationships

- **`src/modules/webhooks/services/subscriptions.ts`** — The `create` function under test; this suite exercises its count-then-insert + rank re-check logic end-to-end.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository` is used to read back stored rows and confirm persistence (or deletion) of the loser's record.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions a real database connection; the race test's correctness depends on this being a live store, not a mock.
- **`tests/support/callers.ts`** — `callerAs` builds caller contexts (manager role, optional user id); `TEST_TENANT_ID` scopes repository queries.
- **`src/modules/users/tests/factories.ts`** — `createUser` creates a real user document so the owner-id test can assert a genuine ObjectId round-trips into the subscription row.

## Notes

- The entire file is **integration-only** by design: the race test is meaningless without a shared, transactional store where two writes can truly interleave. Do not extract or mock the repository for this suite.
- The `if (!result.success) throw new Error('unreachable')` lines after `expect(result.success).toBe(true)` exist solely to narrow the discriminated union for TypeScript; they are never thrown at runtime.
- The cap env var (`NODE_WEBHOOK_SUBSCRIPTION_CAP`) is the single knob that makes the race test deterministic; changing it to `≥2` would let both concurrent creates succeed and break the assertions.
