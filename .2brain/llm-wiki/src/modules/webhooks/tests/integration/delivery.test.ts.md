---
source: src/modules/webhooks/tests/integration/delivery.test.ts
sha256: 01c3ff00f4f450b0292453f6a56d3ce20efe90649010becba07d867b27cf3cea
generated_at: 2026-11-08T09:08:36.067528+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/delivery.test.ts

## Purpose

End-to-end integration test for the webhook delivery pipeline. Runs against a real test database and a locally spawned HTTPS listener (`tests/support/https-test-server.ts`) — never the compose `webhook-tester` service. Verifies the full lifecycle promised by `docs/modules/webhooks.md`: signed delivery arrival, 500-triggered retry, sustained-failure auto-disable, replay re-send, and delivery-log bookkeeping at every step.

## Key elements

- **`jest.mock('node:https', …)`** – Wraps the real `https.request` to inject the suite's throwaway CA (`TEST_CA_CERT`) into every outbound request, replacing the non-viable `NODE_TLS_REJECT_UNAUTHORIZED` approach.
- **`jest.mock('@infrastructure/adapters/ssrf-guard', …)`** – Preserves the guard's HTTPS-only / pinned-lookup contract but allows loopback; a special hostname (`internal.example.test`) is mapped to a `SsrfRefusedError` so refusal paths are testable.
- **`jest.mock('@infrastructure/observability/audit', …)`** – Full module replacement (not a spy) because CommonJS namespace getters are non-configurable; uses the shared `auditPortMock()` helper.
- **`createSubscription(url, eventTypes?)`** – Mints a ring secret, persists a real subscription row via `webhookSubscriptionRepository`.
- **`createPendingDelivery(subscription, eventType?)`** – Persists a `pending` attempt-1 delivery row and returns the wire-shape fields (`deliveryId`, `eventId`, `eventType`, `occurredAt`, `data`) needed for body/signature assertions.
- **`repointSubscription(subscriptionId, url)`** – Updates a subscription's target URL in-place (simulates endpoint recovery).
- **`backdateFailingStreak(subscriptionId)`** – Rewrites `failingSince` to be older than `WEBHOOK_MIN_FAILING_MS` so time-based auto-disable triggers without a multi-day wait.
- **`runChainToCompletion(deliveryId)`** – Re-invokes `processDeliveryJob({ deliveryId })` up to `WEBHOOK_MAX_ATTEMPTS` rounds until the delivery leaves `pending`.
- **`attemptsCounted(outcome)`** – Reads the Prometheus counter `webhookDeliveryAttemptsTotal` for a given `success`/`failure` label.
- **`describe('a successful delivery')`** – Asserts single success metric increment, `webhook-signature` / `webhook-id` / `webhook-timestamp` headers, Standard Webhooks envelope body (`{ type, timestamp, data }`), delivery row status `succeeded`, and `consecutiveFailures` reset to 0.
- **`describe('a 500 response')`** – Asserts single failure metric increment and retry scheduling (content truncated in source but pattern follows).

## Relationships

- **`tests/support/https-test-server.ts`** – Spawns and tears down the local TLS listener used by every test case.
- **`src/modules/webhooks/services/deliveries.ts`** – Source of `replay` (replay re-send test) and the `processDeliveryJob` entry point exercised throughout.
- **`src/modules/webhooks/services/index.ts`** – Exposes `webhooksService.processDeliveryJob` called by every delivery test.
- **`src/modules/webhooks/secrets.ts`** – Provides `mintRingSecret` and `activeRingSecrets` for signing and signature verification.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` and `webhookDeliveryRepository` for all DB reads/writes.
- **`src/modules/webhooks/domain/index.ts`** – Constants `WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_MAX_CONSECUTIVE_FAILURES`, `WEBHOOK_MIN_FAILING_MS` that bound retry logic.
- **`src/modules/webhooks/model.ts`** – `WebhookSubscriptionDocument` type used in fixtures.
- **`src/modules/webhooks/events.ts`** – `WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` domain event captured via `onDomainEvent`.
- **`src/kernel/events.ts`** – `onDomainEvent` / `resetDomainEvents` for event-spy setup and teardown.
- **`src/kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` (referenced in imports).
- **`tests/support/callers.ts`** – `callerAs` / `TEST_TENANT_ID` for the request context.
- **`src/infrastructure/observability/audit.ts`** – Mocked entirely; audit actions recorded but not asserted in visible portion.
- **`src/modules/webhooks/audit.ts`** – `webhooksAuditActions` imported for audit-port assertions.
- **`src/modules/webhooks/metrics.ts`** – `webhookDeliveryAttemptsTotal` counter read by `attemptsCounted`.
- **`src/modules/webhooks/tests/verify-signature.fixture.ts`** – `verifyWebhookSignatureForTest` re-derives the HMAC to validate the outgoing signature header.

## Notes

- The SSRF guard is mocked **by design**: a loopback HTTPS listener is inherently on `127.0.0.1`, which the real guard correctly refuses. The dedicated fuzz suite (`tests/fuzz/webhook-ssrf.fuzz.test.ts`) covers the guard itself.
- `jest.mock('node:https')` exists because `NODE_TLS_REJECT_UNAUTHORIZED=0` does not work with the ESM/`node:`-prefixed import path used here (see `https-test-server.ts` docblock for details).
- The audit mock uses full module replacement (`jest.mock`, not `jest.spyOn`) because CommonJS namespace getters are non-configurable.
- `processDeliveryJob` receives only `{ deliveryId }` (Claim Check pattern per `asyncapi.internal.yaml`); it reads the current `attempt` from the row itself, so `runChainToCompletion` can blindly re-send the same ID each round.
- Auto-disable is **time-gated** (`WEBHOOK_MIN_FAILING_MS`); `backdateFailingStreak` backdates `failingSince` to simulate a multi-day failure streak without actually waiting.
- The `context` object (`callerAs('manager')`, `analyticsConsent: false`) is defined but the visible test bodies use `processDeliveryJob` directly rather than a higher-level service call that would take a context.
