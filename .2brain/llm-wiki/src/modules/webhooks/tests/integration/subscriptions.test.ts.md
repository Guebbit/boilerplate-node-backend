---
source: src/modules/webhooks/tests/integration/subscriptions.test.ts
sha256: 0de0fade83990bb95f3b17b4110a84c2824a3a3822b05cc4535c547960a9ecfa
generated_at: 2026-11-08T09:09:29.168608+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/subscriptions.test.ts

## Purpose

Integration tests for the `create` function in the webhooks subscriptions service. The suite exists because a mocked repository cannot reproduce two writers landing at the same instant; a real database is required to exercise the post-insertion rank re-check that guards the subscription cap race condition. It also verifies that `ownerUserId` is persisted at creation time but excluded from the wire response.

## Key elements

- **`describe('create — the subscription cap boundary')`** — Fires two `create` calls via `Promise.all` with `NODE_WEBHOOK_SUBSCRIPTION_CAP=1`. Asserts exactly one succeeds and the other returns `409` with `WEBHOOK_SUBSCRIPTION_LIMIT_REACHED`. Confirms the loser's row was rolled back (repo `search` returns length 1).
- **`describe('create — captures the owner id')`** — Two tests: (1) a real user's `_id` is stored in `ownerUserId` in the DB while being `undefined` on the serialized response; (2) a non-ObjectId caller id (`'test-user'`) is stored verbatim, confirming no eager lookup at creation.
- **`subscriptionBody(url)`** — Helper that returns a `CreateWebhookSubscriptionRequest` with `eventTypes: ['*']`.
- **`context`** — Shared caller context (`callerAs('manager')`, `analyticsConsent: false`).

## Relationships

- **`src/modules/webhooks/services/subscriptions.ts`** — The `create` function under test.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository` is used for post-creation verification queries (`search`, `findById`).
- **`src/modules/users/tests/factories.ts`** — `createUser` provisions a real user document for the owner-id test.
- **`src/types/index.ts`** — Provides the `CreateWebhookSubscriptionRequest` type.
- **`tests/support/callers.ts`** — `callerAs` builds caller identities; `TEST_TENANT_ID` scopes repo queries.
- **`tests/support/environment.ts`** — `setEnvironment` injects the cap value per test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the real database connection for integration mode.

## Notes

- Tests run against a **real database**, not a mock. The file-level doc comment explicitly states that a mocked repository cannot reproduce the concurrent-writer race that the post-insertion rank check guards against.
- The `rejected[0]?.success` / `throw new Error('unreachable')` pattern is a TypeScript type-narrowing idiom, not defensive runtime logic.
- The owner-id "no lookup" test uses `callerAs('manager')` (default id `'test-user'`, not a valid ObjectId) to prove creation stores the pointer as-is; resolution is deferred to `services/attempt.ts` at send time.
- Wire omission of `ownerUserId` is attributed to `applyWebhookSubscriptionTransform` in `../../model.ts` (referenced in a comment, not imported here).
