---
source: src/modules/webhooks/tests/integration/delivery.test.ts
sha256: d5fae154d348570543993af4bdee49f4e48af979d4ee52dd138f7aaaca7a0c98
generated_at: 2026-10-29T06:31:52.006603+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/delivery.test.ts

## Purpose

Integration test suite that exercises the full webhook delivery pipeline against a real database and a real local HTTPS listener (started/stopped by `tests/support/https-test-server.ts`). It verifies, end-to-end: that a delivery arrives signed over TLS, that a 500 triggers a retry, that sustained failure auto-disables the subscription, that replay re-sends, and that the delivery log records each step.

## Key elements

- **`jest.mock('node:https', …)`** – Wraps `https.request` to inject the suite's throwaway `TEST_CA_CERT` into every outbound TLS connection.
- **`jest.mock('@infrastructure/adapters/ssrf-guard', …)`** – Replaces `resolveSafeOutboundTarget` so loopback (127.0.0.1) is allowed; still rejects `internal.example.test` to exercise the refusal path.
- **`jest.mock('@infrastructure/observability/audit', …)`** – Replaces the audit port with the shared `auditPortMock()` (replaced, not spied, due to CJS non-configurable getters).
- **`createSubscription`** – Creates a real subscription row with one `mintRingSecret()` entry via `webhookSubscriptionRepository.create`.
- **`createPendingDelivery`** – Inserts a `pending`, attempt-1 delivery row; returns a `PendingDeliveryFixture` (wire-shape fields for body/signature assertions).
- **`repointSubscription`** – Saves a new URL on an existing subscription (simulates endpoint recovery).
- **`backdateFailingStreak`** – Sets `failingSince` into the past so the time-based auto-disable threshold (`WEBHOOK_MIN_FAILING_MS`) is crossed without real wall-clock waiting.
- **`runChainToCompletion`** – Repeatedly calls `webhooksService.processDeliveryJob({ deliveryId })` (Claim-Check payload) until the row leaves `pending`.
- **`attemptsCounted`** – Reads the `webhookDeliveryAttemptsTotal` Prometheus counter filtered by outcome label.
- **`describe('a successful delivery')`** – Asserts success counter, signed envelope (`webhook-id`, `webhook-timestamp`, `webhook-signature` headers; `type`/`timestamp`/`data` body), `succeeded` status, and zero consecutive failures.
- **`describe('a 500 response')`** – Asserts failure counter, retry scheduling (truncated in source).
- **`beforeEach` / `afterEach`** – Registers and resets a listener on `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` domain events to collect `disabledFacts`.

## Relationships

- **`tests/support/https-test-server.ts`** – Provides `startHttpsTestServer`, `TEST_CA_CERT`, and the `HttpsTestServer` type; the suite's TLS peer.
- **`tests/support/callers.ts`** – Supplies `callerAs('manager')` and `TEST_TENANT_ID` used in the `context` and repository writes.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` and `webhookDeliveryRepository` are the real persistence layer under test.
- **`src/modules/webhooks/services/index.ts`** – `webhooksService.processDeliveryJob` is the system under test.
- **`src/modules/webhooks/services/deliveries.ts`** – `replay` (imported as `replayDelivery`) exercises the replay path.
- **`src/modules/webhooks/secrets.ts`** – `mintRingSecret` creates the signing key; `activeRingSecrets` re-derives plaintext for signature verification.
- **`src/modules/webhooks/tests/verify-signature.fixture.ts`** – `verifyWebhookSignatureForTest` performs the independent signature check in assertions.
- **`src/modules/webhooks/domain/index.ts`** – Exports `WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_MAX_CONSECUTIVE_FAILURES`, `WEBHOOK_MIN_FAILING_MS` constants the fixtures and loop bounds rely on.
- **`src/modules/webhooks/model.ts`** – `WebhookSubscriptionDocument` type for fixture return values.
- **`src/kernel/events.ts`** – `onDomainEvent` / `resetDomainEvents` / `DomainEventMap` for capturing auto-disable facts.
- **`src/modules/webhooks/events.ts`** – `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` event key.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` referenced in the suite.
- **`src/modules/webhooks/metrics.ts`** – `webhookDeliveryAttemptsTotal` counter read in assertions.
- **`src/infrastructure/observability/audit.ts`** – Mocked to isolate audit side-effects.
- **`src/modules/webhooks/audit.ts`** – `webhooksAuditActions` imported (likely asserted on audit-log contents).

## Notes

- **SSRF guard is intentionally mocked.** A real local HTTPS listener binds to loopback, which the production guard correctly refuses. The mock preserves the guard's HTTPS-only contract and pinned `lookup` so the TLS path still goes through it.
- **`node:https` is mocked, not env-flagged.** `NODE_TLS_REJECT_UNAUTHORIZED` does not work for the in-process listener; injecting `ca` per-request is the only reliable path (see `https-test-server.ts` doc).
- **Audit is *replaced*, not spied.** `jest.spyOn` cannot redefine the non-configurable getter that a CommonJS `import *` exposes; this matches the pattern in `account`'s own integration suites.
- **Auto-disable is time-based (Stripe/Svix style).** Test chains exhaust in well under a second, so `backdateFailingStreak` fakes elapsed time rather than waiting.
- **Job payload is Claim-Check only** (`{ deliveryId }`), per `../../asyncapi.internal.yaml`. The full body is reconstructed by `processDeliveryJob` from the stored row.
- The suite never uses the compose `webhook-tester` service; it is fully self-contained with its own local HTTPS peer.
