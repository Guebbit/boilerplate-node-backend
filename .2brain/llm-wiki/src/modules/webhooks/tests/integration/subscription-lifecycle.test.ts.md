---
source: src/modules/webhooks/tests/integration/subscription-lifecycle.test.ts
sha256: d01b685043631c1e5dd584384de896c7702712ce7ed4925b25efe6658b25e39f
generated_at: 2026-10-29T06:32:36.511555+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/subscription-lifecycle.test.ts

## Purpose

Integration tests that exercise the webhook **subscription service** end-to-end against a real database. They pin service-level outcomes for listing, reading, creation (including validation and SSRF-refusal paths), the secret ring, disable/enable, update, and removal. Because the HTTP contract suite is outside the mutation ruler's scope, these tests lock the same outcomes at the service boundary.

## Key elements

- **`jest.mock('@infrastructure/adapters/ssrf-guard')`** – Replaces `resolveSafeOutboundTarget` so any URL on `REFUSED_HOST` (`internal.example.test`) rejects with `SsrfRefusedError`; all other URLs resolve to a public address. Records every checked URL in `mockChecked`.
- **`jest.mock('@infrastructure/observability/audit')`** – Swaps the audit port with `auditPortMock()` so `emitAuditEvent` calls are capturable.
- **`subscribe(url?, eventTypes?)`** – Convenience wrapper around `create` that throws if the service refuses.
- **`stored(id)` / `read(id, key)` / `ringIds(id)`** – Helpers that read rows back directly via `webhookSubscriptionRepository.findById`.
- **`auditedAs(action)`** – Filters captured `emitAuditEvent` calls to a single audit action.
- **`describe('listing')`** – Tenant isolation, newest-first ordering, `enabled`/`autoDisabled` filters, sort with id tiebreak, and per-role `actions` on each row.
- **`describe('reading one')`** – `getById` returns the row for own tenant, `undefined` for unknown or foreign-tenant ids.
- **`describe('what a create refuses')`** – Unknown event types (422), SSRF-refused URL (422, no internal reason leaked, `logger.warn` fires), tenant subscription cap (409, guard not invoked), and per-tenant cap counting.

## Relationships

- **`src/modules/webhooks/services/subscriptions.ts`** – The module under test; every service function (`create`, `list`, `getById`, `update`, `disable`, `enable`, `remove`, `createSecret`, `removeSecret`) is called directly.
- **`src/modules/webhooks/services/catalogue.ts`** – `registerWebhookCatalogue` sets the allowed event-type catalogue in `beforeEach` / clears it in `afterEach`.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` is used to insert foreign-tenant rows and to read stored rows back; `webhookDeliveryRepository` is imported (used in truncated portions).
- **`src/modules/webhooks/model.ts`** – `WebhookSubscriptionDocument` type constrains the `read` helper's key parameter.
- **`src/modules/webhooks/secrets.ts`** – `mintRingSecret` produces a secret entry for direct repository inserts.
- **`src/modules/webhooks/audit.ts`** – `webhookSubscriptionRepository` and `webhookAuditActions` are imported for audit-action assertions.
- **`src/infrastructure/observability/audit.ts`** – Fully mocked; `emitAuditEvent` is the capture point.
- **`src/infrastructure/adapters/logger.ts`** – `logger.warn` is spied to assert the SSRF-refusal log fires with `reason: 'unsafe-address'`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` provisions the real database for the whole suite.
- **`tests/support/callers.ts`** – `callerAs('manager')` builds the default tenant caller; a read-only variant is constructed inline for the actions test.
- **`tests/support/environment.ts`** – `setEnvironment` toggles `NODE_WEBHOOK_SUBSCRIPTION_CAP` for the limit test.

## Notes

- **Jest hoisting constraint:** `mockChecked` is prefixed `mock*` so the hoisted `jest.mock` factory can close over it; a plain `const checked` would throw.
- **Audit is mocked, not spied:** `recordAudit` closes over its own module's `emitAuditEvent`, so a simple `jest.spyOn` on the export would miss internal calls. The mock replaces the whole port.
- **SSRF guard is fully replaced, not partially spied:** Its own integration coverage lives in `tests/fuzz/`; duplicating it here would create a second source of truth for the guard's behaviour.
- **SSRF refusal message is asserted to NOT contain `"private address"`** — the internal reason must not leak to the caller.
- **Subscription-cap test asserts `mockChecked` is empty** after the refusal, proving the guard is short-circuited before URL validation when the cap is hit.
- **Tenant isolation is tested in every `describe` block** by inserting a row under `'another-tenant'` and asserting it never appears.
- **`registerWebhookCatalogue` is global mutable state** — it is set in `beforeEach` and cleared in `afterEach`; forgetting to clear it leaks the catalogue into other test files running in the same worker.
