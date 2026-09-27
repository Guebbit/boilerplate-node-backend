---
source: src/modules/webhooks/tests/integration/delivery.test.ts
sha256: b21fe387642a41e51a7e5f314711b7daac3f1489383143e1aab865ee47c4fec4
generated_at: 2026-09-27T15:45:44.929971+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/delivery.test.ts

## Purpose

End-to-end integration test for the webhook delivery pipeline. It runs against a real database and a self-managed local HTTPS listener (`tests/support/https-test-server.ts`), covering the full lifecycle: signed delivery, 500-triggered retry scheduling, sustained-failure auto-disable, replay re-send, and delivery-log state at each step. It deliberately does **not** use the Compose `webhook-tester` service.

## Key elements

- **`jest.mock('node:https', …)`** – wraps `request` to inject `TEST_CA_CERT` into every outbound TLS connection so the local test server's self-signed cert is accepted without disabling certificate verification globally.
- **`jest.mock('@infrastructure/adapters/ssrf-guard', …)`** – overrides only `resolveSafeOutboundTarget` to allow loopback (a real local listener is inherently on 127.0.0.1, which the real guard correctly refuses). All other guard behaviour (HTTPS-only, pinned `lookup`) is preserved.
- **`jest.mock('@infrastructure/adapters/mailer', …)`** – replaces `enqueueEmail` with a plain `jest.fn()` so the auto-disable notification can be asserted in isolation.
- **`jest.mock('@infrastructure/observability/audit', …)`** – replaces `emitAuditEvent` and reroutes `recordAudit` through the replacement (because `recordAudit` closes over its module's own `emitAuditEvent`). Replaced rather than spied on due to a non-configurable CJS namespace getter.
- **`createSubscription`** – mints a ring secret via `mintRingSecret()` and persists a real subscription row through `webhookSubscriptionRepository`.
- **`createPendingDelivery`** – inserts a `pending`, attempt-1 delivery row and returns the wire-shape fields (`deliveryId`, `eventId`, `eventType`, `occurredAt`, `data`) needed for body/signature assertions. Does **not** return the job payload.
- **`repointSubscription`** – updates a subscription's `url` in place (simulates an endpoint moving or recovering).
- **`backdateFailingStreak`** – sets `failingSince` into the past so the time-gated auto-disable threshold (`WEBHOOK_MIN_FAILING_MS`) is crossed without waiting in real time.
- **`runChainToCompletion`** – re-submits `{ deliveryId }` to `processDeliveryJob` up to `WEBHOOK_MAX_ATTEMPTS` rounds until the delivery leaves `pending`.
- **Test blocks** – `describe` groups for: successful delivery (signature + envelope + log), 500 retry scheduling, sustained-failure auto-disable (truncated in sample), replay re-send.

## Relationships

| Neighbor | Interaction |
|---|---|
| `modules/webhooks/services/index.ts` | Calls `processDeliveryJob({ deliveryId })` – the Claim Check entry point. |
| `modules/webhooks/services/deliveries.ts` | Calls `replay` to re-send a previously completed delivery. |
| `modules/webhooks/repository.ts` | Reads/writes `webhookSubscriptionRepository` and `webhookDeliveryRepository` for all fixture setup and state assertions. |
| `modules/webhooks/secrets.ts` | Uses `mintRingSecret` (fixture creation) and `activeRingSecrets` (signature verification). |
| `modules/webhooks/domain/index.ts` | Imports `WEBHOOK_MAX_ATTEMPTS`, `WEBHOOK_MAX_CONSECUTIVE_FAILURES`, `WEBHOOK_MIN_FAILING_MS` to drive retry-loop bounds and time-backdating. |
| `modules/webhooks/model.ts` | `WebhookSubscriptionDocument` type used in fixtures. |
| `modules/webhooks/audit.ts` | Imports `webhooksAuditActions` for audit-event assertions. |
| `infrastructure/observability/audit.ts` | Mocked; `emitAuditEvent` and `recordAudit` replaced to capture audit side-effects. |
| `infrastructure/adapters/logger.ts` | Imported as `logger` (available for log assertions or silencing). |
| `modules/users/index.ts` / `modules/users/service.ts` | `userService` used for owner-related setup. |
| `modules/users/tests/factories.ts` | `createUser` factory to create a real user row. |
| `tests/support/callers.ts` | `callerAs('manager')` and `TEST_TENANT_ID` for auth/tenant context. |
| `modules/webhooks/tests/verify-signature.fixture.ts` | `verifyWebhookSignatureForTest` to independently verify the received `webhook-signature` header. |

## Notes

- **SSRF guard is mocked on purpose.** A real local listener resolves to loopback, which the production guard (correctly) always rejects. The dedicated SSRF test lives in `tests/fuzz/webhook-ssrf.fuzz.test.ts`.
- **`NODE_TLS_REJECT_UNAUTHORIZED` is NOT used.** The test CA is injected per-request via the `node:https` mock, avoiding a global process-level flag that would leak across tests.
- **Job payload is Claim Check (`{ deliveryId }` only).** The full wire body is reconstructed from the persisted delivery row at delivery time; fixtures must therefore return the row's fields, not a pre-built job object.
- **Auto-disable is time-gated** (`WEBHOOK_MIN_FAILING_MS`). A fast-failing test loop never crosses it naturally; `backdateFailingStreak` backdates `failingSince` to simulate a multi-day streak.
- **Audit mock uses full module replacement, not `jest.spyOn`.** The CJS namespace getter is non-configurable, so the standard spy pattern fails. `recordAudit` is explicitly rerouted because it closes over the module's own `emitAuditEvent`.
- The test suite starts/stops its own HTTPS server per `describe` block; it never depends on the Compose `webhook-tester` service.
