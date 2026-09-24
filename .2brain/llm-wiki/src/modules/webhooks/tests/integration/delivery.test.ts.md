---
source: src/modules/webhooks/tests/integration/delivery.test.ts
sha256: 363775f4f3b143cad4965bd42298cfe748034b9429c7ab4893a836f5d15bc7a2
generated_at: 2026-09-23T19:44:13.136838+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/delivery.test.ts

## Purpose

End-to-end integration test for the webhook delivery pipeline. It spins up a real local HTTPS listener (via `tests/support/https-test-server.ts`) and a real test database, then exercises the full path: signed delivery arrival, 500 → retry scheduling, sustained-failure auto-disable, replay re-send, and delivery-log bookkeeping. Everything in the pipeline runs for real except the SSRF guard (loopback would be correctly refused) and the mailer/audit sinks (replaced with mocks).

## Key elements

- **`createSubscription(url, eventTypes?, ownerUserId?)`** – Persists a `WebhookSubscriptionDocument` with one minted ring secret via `webhookSubscriptionRepository.create`.
- **`createPendingDelivery(subscription, eventType?)`** – Inserts a `pending`, attempt-1 delivery row and returns the wire-shape fields (`deliveryId`, `eventId`, `eventType`, `occurredAt`, `data`) needed for body/signature assertions.
- **`repointSubscription(subscriptionId, url)`** – Mutates an existing subscription's `url` to simulate an endpoint moving or recovering.
- **`backdateFailingStreak(subscriptionId)`** – Sets `failingSince` to `WEBHOOK_MIN_FAILING_MS + 60 s` in the past so auto-disable triggers without waiting a real multi-day window.
- **`runChainToCompletion(deliveryId)`** – Repeatedly calls `processDeliveryJob({ deliveryId })` up to `WEBHOOK_MAX_ATTEMPTS` rounds until the delivery leaves `pending`.
- **`describe` blocks** – One per scenario: successful delivery, 500 retry, auto-disable, replay, delivery-log integrity (truncated in this view).
- **Module-level `jest.mock` calls** – `node:https` (CA injection), `ssrf-guard` (loopback bypass), `mailer` (enqueueEmail), `audit` (emitAuditEvent / recordAudit re-route).

## Relationships

- **`@modules/webhooks/services/index.ts`** – Imports `processDeliveryJob`, the primary SUT under test.
- **`@modules/webhooks/services/deliveries.ts`** – Imports `replay` for the replay re-send scenario.
- **`@modules/webhooks/repository.ts`** – Uses `webhookSubscriptionRepository` and `webhookDeliveryRepository` to create/inspect rows.
- **`@modules/webhooks/secrets.ts`** – Uses `mintRingSecret` (fixture setup) and `activeRingSecrets` (signature verification).
- **`@modules/webhooks/domain/index.ts`** – Imports `WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_MAX_CONSECUTIVE_FAILURES`, `WEBHOOK_MIN_FAILING_MS` to drive loop bounds and backdating.
- **`@modules/webhooks/model.ts`** – Type-only import of `WebhookSubscriptionDocument`.
- **`@modules/webhooks/audit.ts`** – Imports `webhooksAuditActions` for audit-event assertions.
- **`@infrastructure/observability/audit.ts`** – Mocked module; the test asserts on `emitAuditEvent` calls and re-routes `recordAudit` through the mock.
- **`@infrastructure/adapters/logger.ts`** – Imported (likely for log-transport assertions in the delivery-log scenario).
- **`@modules/users/tests/factories.ts`** – `createUser` for owner-scoped subscription tests.
- **`@modules/users/index.ts`** – `userService` for tenant-scoped user operations.
- **`@modules/webhooks/tests/verify-signature.fixture.ts`** – `verifyWebhookSignatureForTest` to independently validate the `webhook-signature` header.
- **`tests/support/callers.ts`** – `callerAs('manager')` and `TEST_TENANT_ID` for the auth context.

## Notes

- **SSRF guard is intentionally mocked.** A real local HTTPS listener binds to `127.0.0.1`, which the guard correctly refuses. The mock preserves the HTTPS-only and pinned-lookup contract so the real TLS path still exercises the guard's code. A dedicated fuzz suite (`tests/fuzz/webhook-ssrf.fuzz.test.ts`) covers the guard itself.
- **`node:https` mock injects `TEST_CA_CERT`** into every request's `ca` array rather than setting `NODE_TLS_REJECT_UNAUTHORIZED`, because the latter cannot be scoped per-request in this Node/Jest setup.
- **Audit is replaced, not spied.** `jest.spyOn` cannot redefine the non-configurable getter on a CJS namespace import, so the whole module is replaced. `recordAudit` is re-wired to call the mocked `emitAuditEvent` because it closes over its own module's real binding.
- **`runChainToCompletion` re-sends the same `{ deliveryId }`** each round; `claimPending` reads the row's current `attempt` internally, so the test does not track attempt numbers across retries.
- **Auto-disable timing** is time-gated (`WEBHOOK_MIN_FAILING_MS`); the test backdates `failingSince` rather than waiting in real time.
- **The `PendingDeliveryFixture` is intentionally not the job payload.** `processDeliveryJob` takes only `{ deliveryId }` (Claim Check pattern per `asyncapi.internal.yaml`); the fixture exists solely to give assertion helpers the fields they need.
