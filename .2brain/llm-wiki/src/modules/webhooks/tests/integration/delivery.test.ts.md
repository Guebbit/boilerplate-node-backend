---
source: src/modules/webhooks/tests/integration/delivery.test.ts
sha256: 4fa9acac3a721efc0a27081bf83476b65e2114a963ca66e2d4afd225175e7c5a
generated_at: 2026-10-15T12:23:41.830395+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/delivery.test.ts

## Purpose

Integration test suite for the webhook delivery pipeline, exercising the full path (signing → TLS request → retry scheduling → auto-disable → replay → audit log) against a real database and a self-managed local HTTPS listener. It verifies the behavioral contract documented in `docs/modules/webhooks.md`'s integration section: a signed delivery arrives correctly, a 500 triggers retries, sustained failure auto-disables the subscription, replay re-sends, and the delivery log records each step.

## Key elements

- **`jest.mock('node:https')`** — Wraps `https.request` to inject the suite's throwaway `TEST_CA_CERT`, because `NODE_TLS_REJECT_UNAUTHORIZED` does not work with the test server's self-signed cert.
- **`jest.mock('@infrastructure/adapters/ssrf-guard')`** — Allows loopback (127.0.0.1) connections the real guard would refuse; preserves HTTPS-only and pinned `lookup` semantics. A special hostname `internal.example.test` is rejected to simulate a genuine SSRF refusal.
- **`jest.mock('@infrastructure/adapters/mailer')`** — Replaces `enqueueEmail` with a jest mock so the auto-disable notification call can be asserted directly.
- **`jest.mock('@infrastructure/observability/audit')`** — Replaces `emitAuditEvent` and re-routes `recordAudit` through it (a `jest.spyOn` would fail on the non-configurable CommonJS getter).
- **`createSubscription(url, eventTypes?, ownerUserId?)`** — Creates a real subscription row with one ring secret via `webhookSubscriptionRepository`.
- **`createPendingDelivery(subscription, eventType?)`** — Creates a `pending`, attempt-1 delivery row and returns the wire-shape fields (`deliveryId`, `eventId`, `eventType`, `occurredAt`, `data`) needed for body/signature assertions.
- **`repointSubscription(subscriptionId, url)`** — Updates a subscription's URL to simulate an endpoint moving or recovering.
- **`backdateFailingStreak(subscriptionId)`** — Sets `failingSince` to before `WEBHOOK_MIN_FAILING_MS` so the time-based auto-disable threshold is met without waiting real minutes.
- **`runChainToCompletion(deliveryId)`** — Repeatedly calls `processDeliveryJob({ deliveryId })` up to `WEBHOOK_MAX_ATTEMPTS` rounds until the row leaves `pending`.
- **`attemptsCounted(outcome)`** — Reads the Prometheus counter `webhookDeliveryAttemptsTotal` and returns the value for a given `outcome` label.
- **`describe('a successful delivery')`** — First test block; asserts the attempt counter increments exactly once for success, the request carries valid signature headers, the body matches the Standard Webhooks envelope (`{ type, timestamp, data }`), and the DB row records `succeeded` with response code 200.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/webhooks/repository.ts` | Imports `webhookSubscriptionRepository` and `webhookDeliveryRepository` to create/read delivery and subscription rows directly. |
| `src/modules/webhooks/services/index.ts` | Imports `processDeliveryJob` — the unit under test for each delivery round. |
| `src/modules/webhooks/services/deliveries.ts` | Imports `replay` (aliased `replayDelivery`) for the replay test path. |
| `src/modules/webhooks/secrets.ts` | Imports `mintRingSecret` (fixture creation) and `activeRingSecrets` (signature verification in assertions). |
| `src/modules/webhooks/domain/index.ts` | Imports `WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_MAX_CONSECUTIVE_FAILURES`, `WEBHOOK_MIN_FAILING_MS` to drive loop bounds and time-backdating. |
| `src/modules/webhooks/model.ts` | Imports the `WebhookSubscriptionDocument` type for helper signatures. |
| `src/modules/webhooks/metrics.ts` | Imports `webhookDeliveryAttemptsTotal` to assert Prometheus counter increments. |
| `src/modules/webhooks/audit.ts` | Imports `webhooksAuditActions` for audit-event assertions. |
| `src/modules/webhooks/tests/verify-signature.fixture.ts` | Imports `verifyWebhookSignatureForTest` to validate the `webhook-signature` header against the subscription's ring. |
| `src/modules/users/index.ts` | Imports `userService` (used in tests that exercise per-user webhook ownership). |
| `src/modules/users/tests/factories.ts` | Imports `createUser` to seed user rows. |
| `src/infrastructure/observability/audit.ts` | Fully mocked; `emitAuditEvent` and `recordAudit` are replaced so audit calls can be spied on. |
| `src/infrastructure/adapters/logger.ts` | Imported as `logger` (available for log-output assertions in test bodies). |

## Notes

- The SSRF guard is **deliberately mocked**: a real local listener is on loopback, which the guard correctly refuses. Its dedicated fuzz tests live in `tests/fuzz/webhook-ssrf.fuzz.test.ts`.
- `jest.mock` is used for the audit and mailer adapters instead of `jest.spyOn` because CommonJS namespace imports expose non-configurable getters that `spyOn` cannot redefine.
- The job payload passed to `processDeliveryJob` is Claim-Check shape (`{ deliveryId }` only, per `asyncapi.internal.yaml`); the full wire envelope is reconstructed from the DB row at assertion time.
- Auto-disable is time-gated (`WEBHOOK_MIN_FAILING_MS`), so the suite backdates `failingSince` rather than waiting real wall-clock time.
- The test server is started/stopped per `beforeEach`/`afterEach` via `@tests/https-test-server`; it is **not** the Compose `webhook-tester` service.
