---
source: tests/integration/ops-webhook-retry-job.test.ts
sha256: dd25e91bdd3e800d1477628fb07ecdc6e101bcd2d97eb96503ae3a4746ba96a2
generated_at: 2026-11-08T09:43:26.097543+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/ops-webhook-retry-job.test.ts

## Purpose

Integration test that exercises the webhook retry sweep job through the same `prepareJob` path used by `npm run job`, in a no-broker environment where delivery is inline. It verifies that when the sweep auto-disables a subscription (consecutive failures exhausted), a staff notification is emitted.

## Key elements

- **Queue & delivery mocks** — `publishToQueue` resolves `false` (simulating no broker); `deliverWebhook` always returns `{ success: false, error: 'HTTP 500' }` so every inline send fails.
- **`setupTestDb()`** — provisions an in-memory database for the test run.
- **`resetDomainEvents()`** in `beforeEach`/`afterEach` — clears any pre-registered event listeners so only what `prepareJob` wires from the job's `needs` is active.
- **Test: "tells the staff when its inline send auto-disables a subscription"** —
  - Creates a manager user and a ring secret.
  - Seeds a subscription one failure short of `WEBHOOK_MAX_CONSECUTIVE_FAILURES` with `failingSince` old enough to satisfy `WEBHOOK_MIN_FAILING_MS`.
  - Seeds a delivery on attempt `WEBHOOK_MAX_ATTEMPTS`, status `pending`, `nextAttemptAt` in the past.
  - Calls `prepareJob(job)` then `job.run()`.
  - Asserts `notifications.staff.webhook-disabled` appears in the manager's visible notifications.

## Relationships

- **`scripts/ops/prepare-job.ts`** — the test calls `prepareJob(job)` to install the job's declared `needs`, mirroring production startup.
- **`src/modules/webhooks/jobs.ts`** — source of the `webhooksJobs` array; the test takes the first entry.
- **`src/modules/webhooks/domain/index.ts`** — provides the `WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_MAX_CONSECUTIVE_FAILURES`, `WEBHOOK_MIN_FAILING_MS` constants used to seed boundary data.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository.create` and `webhookDeliveryRepository.create` seed the test fixture.
- **`src/modules/webhooks/secrets.ts`** — `mintRingSecret` produces a valid secret for the subscription.
- **`src/modules/notifications/services/index.ts`** — `notificationsService.listVisible` is the assertion target.
- **`src/modules/users/tests/factories.ts`** — `createUser` creates the manager.
- **`src/kernel/events.ts`** — `resetDomainEvents` isolates event wiring between tests.
- **`src/kernel/permissions.ts`** — `callerInScope` builds the scoped caller for the notification query.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` used in the caller scope.
- **`tests/support/callers.ts`** — `asRole` and `TEST_TENANT_ID` helpers.
- **`tests/support/setup-test-db.ts`** — database bootstrap.

## Notes

- The test intentionally does **not** register any event listeners itself; it relies solely on `prepareJob` to wire them, catching regressions where the job declaration omits `subscriptions` from its `needs` (which would disable the subscription silently with no staff notification).
- Both `beforeEach` and `afterEach` call `resetDomainEvents()` to prevent listener leakage across tests.
