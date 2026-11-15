---
source: src/modules/webhooks/tests/integration/delivery.test.ts
sha256: a266f0ab148d8da41a5e99c820e721047a2b4de40108495e87ea8202a266706a
generated_at: 2026-11-14T22:49:40.542210+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/delivery.test.ts

## Purpose

End-to-end integration suite for the webhook delivery pipeline, exercising the full path against a **real database** and a **real local HTTPS listener** (started/stopped by the test via `tests/support/https-test-server.ts`). It verifies that a delivery arrives with a valid signature, that a 500 triggers a retry chain, that sustained failure auto-disables the subscription, that replay re-sends, and that the delivery log records every step. The SSRF guard is mocked on purpose because the local test server is inherently on loopback, which the guard correctly always refuses.

## Key elements

- **`jest.mock('node:https')`** — wraps the real `https.request` to inject `TEST_CA_CERT` into every request's `ca` array (the test server uses a throwaway CA).
- **`jest.mock('@infrastructure/adapters/ssrf-guard')`** — preserves the real guard's contract (HTTPS-only, pinned `lookup`) but allows loopback addresses; rejects `internal.example.test` with an `SsrfRefusedError` so a refused-delivery path is still testable.
- **`jest.mock('@infrastructure/observability/audit')`** — fully replaces the audit port with `auditPortMock()` from `@tests/ports` (replaced, not spied, because `jest.spyOn` cannot redefine the non-configurable getter on a CommonJS namespace import).
- **`createSubscription(url, eventTypes?)`** — mints a ring secret and persists a subscription row via `webhookSubscriptionRepository`.
- **`createPendingDelivery(subscription, eventType?)`** — inserts a `pending`, attempt-1 delivery row and returns the wire-shape fields needed for body/signature assertions.
- **`runChainToCompletion(deliveryId)`** — calls `webhooksService.processDeliveryJob({ deliveryId })` up to `WEBHOOK_MAX_ATTEMPTS` rounds until the delivery leaves `pending`.
- **`backdateFailingStreak(subscriptionId)`** — sets `failingSince` to the past so the time-based auto-disable threshold (`WEBHOOK_MIN_FAILING_MS`) is crossed without waiting in real time.
- **`repointSubscription(subscriptionId, url)`** — changes a subscription's URL to simulate an endpoint moving or recovering.
- **`disabledFacts`** / **`onDomainEvent`** listener — collects `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` domain events emitted during a test.
- **`total()`** / **`attemptsCounted(outcome)`** — read the Prometheus-style counters (`webhookSubscriptionsAutoDisabledTotal`, `webhookDeliveryAttemptsTotal`) to assert metric increments.
- **`describe('a successful delivery')`** — asserts the attempt is counted once as success, the request carries the correct signature (verified via `verifyWebhookSignatureForTest`), the body matches the Standard Webhooks envelope (`{ type, timestamp, data }`), and the delivery row shows `succeeded` / 200 / attempt 1.
- **`describe('a 500 response')`** — exercises the retry path (content truncated in the excerpt).

## Relationships

- **`tests/support/https-test-server.ts`** — provides `startHttpsTestServer`, `TEST_CA_CERT`, and the `HttpsTestServer` type; the test starts a real TLS listener per `describe` block.
- **`tests/support/callers.ts`** — supplies `callerAs('manager')` and `TEST_TENANT_ID` for tenant-scoped test data.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository` and `webhookDeliveryRepository` are the persistence layer the suite reads/writes directly for fixtures and assertions.
- **`src/modules/webhooks/services/index.ts`** — the webhooks service module under test; the suite drives the delivery executor through its public API for each scenario (success, retry, auto-disable, replay).
- **`src/modules/webhooks/services/deliveries.ts`** — `replay` (imported as `replayDelivery`) is the entry point for the replay scenario.
- **`src/modules/webhooks/secrets.ts`** — `mintRingSecret` creates the signing key; `activeRingSecrets` re-derives the plaintext key for signature verification in assertions.
- **`src/modules/webhooks/domain/index.ts`** — `WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_MAX_CONSECUTIVE_FAILURES`, `WEBHOOK_MIN_FAILING_MS` drive the retry loop and auto-disable threshold.
- **`src/modules/webhooks/model.ts`** — `WebhookSubscriptionDocument` type used in fixture helpers.
- **`src/modules/webhooks/events.ts`** — `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` domain event the suite listens for.
- **`src/kernel/events.ts`** — `onDomainEvent` / `resetDomainEvents` manage the in-process event bus for the auto-disable assertion.
- **`src/modules/webhooks/metrics.ts`** — `webhookDeliveryAttemptsTotal` and `webhookSubscriptionsAutoDisabledTotal` counters read to verify metric side-effects.
- **`src/modules/webhooks/audit.ts`** — `webhooksAuditActions` (imported; likely used in the truncated portion for audit-log assertions).
- **`src/infrastructure/observability/audit.ts`** — the audit port that is replaced with a test mock.
- **`src/modules/webhooks/tests/verify-signature.fixture.ts`** — `verifyWebhookSignatureForTest` re-computes the HMAC signature from the subscription's ring for assertion.
- **`src/kernel/access/tenant.ts`** — `DEPLOYMENT_TENANT_ID` imported (likely used in the truncated portion for tenant-scoped assertions).

## Notes

- **SSRF guard is mocked, not removed.** The mock preserves the guard's HTTPS-only and pinned-`lookup` contract; it only relaxes the loopback restriction. A dedicated fuzz suite (`tests/fuzz/webhook-ssrf.fuzz.test.ts`) covers the guard's real refusal logic.
- **CA injection via `node:https` mock, not `NODE_TLS_REJECT_UNAUTHORIZED`.** The test server uses a throwaway CA; setting the env var would affect the entire Node process. Injecting `ca` per-request is scoped and safe.
- **Audit is "replaced, not spied on."** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS `import * as` exposes. The full-module `jest.mock` factory pattern is the established workaround (same pattern used by the `account` module's integration suites).
- **Auto-disable is time-based, not count-based** (like Stripe/Svix). A real test chain exhausts in well under a second, so `backdateFailingStreak` shifts `failingSince` into the past to cross `WEBHOOK_MIN_FAILING_MS` without sleeping.
- **The job payload is Claim-Check shape** (`{ deliveryId }` only, per `asyncapi.internal.yaml`). The full delivery data is read from the DB at execution time; test fixtures build the wire-shape object separately for assertions.
- **`runChainToCompletion` does not track attempt number.** `claimPending` reads the row's *current* `attempt` on each call, so re-sending the same `{ deliveryId }` is sufficient.
