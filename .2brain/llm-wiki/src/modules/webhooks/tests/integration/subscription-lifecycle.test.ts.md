---
source: src/modules/webhooks/tests/integration/subscription-lifecycle.test.ts
sha256: b4ef18b1205396d91c1e09c95ae72f07510031b57c5860d4e1105fa38d84d44a
generated_at: 2026-10-15T12:24:09.273843+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/subscription-lifecycle.test.ts

## Purpose

End-to-end integration tests for the webhook subscription service (`create`, `list`, `update`, `remove`, `rotateSecret`, `removeSecret`) run against a real database. It pins service-level outcomes — listing order/tenant isolation, validation refusals, partial-update semantics, secret-ring rotation, and removal — in places where the HTTP contract suite does not already cover them (the SSRF-guard table lives under `tests/fuzz/`).

## Key elements

- **SSRF-guard mock** (`jest.mock('@infrastructure/adapters/ssrf-guard')`) — replaces `resolveSafeOutboundTarget` so that `internal.example.test` always rejects; records every URL asked about in the `mockChecked` array (named `mock*` so the hoisted mock can close over it).
- **Audit mock** (`jest.mock('@infrastructure/observability/audit')`) — swaps in a jest-fn `emitAuditEvent` and a thin `recordAudit` wrapper, enabling assertions on emitted audit events via the `auditedAs(action)` helper.
- **`subscribe(url?, eventTypes?)`** — convenience helper that calls `create` and throws on failure, returning the created subscription document.
- **`stored(id)` / `read(id, key)` / `ringIds(id)`** — read-back helpers that query `webhookSubscriptionRepository.findById` to assert persisted state.
- **`describe` blocks** — *listing*, *what a create refuses*, *updating*, and (truncated) secret-ring and removal suites.
- **`context`** — a fixed caller context (`callerAs('manager')`, `analyticsConsent: false`) shared across tests.
- **`beforeEach` / `afterEach`** — reset `mockChecked`, clear the audit mock, register `['orders']` in the catalogue, spy on `logger.warn`; tear down by unregistering the catalogue and restoring all mocks.

## Relationships

- **`src/modules/webhooks/services/subscriptions.ts`** — the system under test; all six exported service functions are imported and exercised.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository` is used directly to insert foreign-tenant rows and to read back stored state; `webhookDeliveryRepository` is imported (likely used in the truncated removal/rotation sections).
- **`src/modules/webhooks/services/catalogue.ts`** — `registerWebhookCatalogue` is called in `beforeEach`/`afterEach` to control which event names are considered valid.
- **`src/modules/webhooks/audit.ts`** — `webhooksAuditActions` provides the action-name constants used in audit assertions.
- **`src/modules/webhooks/model.ts`** — `WebhookSubscriptionDocument` type parameterises the generic `read` helper.
- **`src/modules/webhooks/secrets.ts`** — `mintRingSecret` generates fixture secret entries for direct repository inserts.
- **`src/infrastructure/observability/audit.ts`** — fully replaced (not spied) so that `recordAudit`'s internal closure over `emitAuditEvent` is intercepted.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is spied on to assert the SSRF-refusal warning is logged with `reason: 'unsafe-address'`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the real database before the suite runs.
- **`tests/support/callers.ts`** — `callerAs('manager')` builds the authenticated caller identity used in every service call.
- **`tests/support/environment.ts`** — `setEnvironment` sets `NODE_WEBHOOK_SUBSCRIPTION_CAP` for the limit-exceeded tests.

## Notes

- The SSRF guard is **replaced**, not spied: the real module's `SsrfRefusedError` class is re-exported via `jest.requireActual` so the service still throws the correct error type.
- `mockChecked` must be named with the `mock` prefix because `jest.mock` is hoisted above it; without the prefix the factory would capture `undefined`.
- The audit mock is likewise a **replacement** (not a spy) because `recordAudit` closes over its own module's `emitAuditEvent` binding; a simple spy on the imported function would not intercept it.
- Tenant isolation is verified by inserting rows under `'another-tenant'` directly through the repository, bypassing the service layer.
- The subscription-cap test asserts that the URL guard is **never consulted** when the cap is already hit (`mockChecked` stays empty), confirming short-circuit ordering in the service.
- The module doc-comment explicitly scopes this file to the *service door*; the HTTP contract suite and the SSRF fuzz table are separate test files.
