---
source: src/modules/webhooks/tests/integration/subscription-lifecycle.test.ts
sha256: b7a0a1bdb39b4825f14572a9bdf429b9df0cb0d0cac0921b4801c8a621dae761
generated_at: 2026-11-08T09:09:17.791927+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/subscription-lifecycle.test.ts

## Purpose

Integration tests that exercise the webhook subscription service (`services/subscriptions.ts`) end-to-end against a real database. They pin the service-level contract for listing, reading, create-validation, enable/disable, the secret ring, and removal — covering outcomes that the HTTP-level contract suite does not assert. The SSRF guard is replaced (not spied) because its own dedicated test table lives in `tests/fuzz/`.

## Key elements

- **`jest.mock('@infrastructure/adapters/ssrf-guard', …)`** — Replaces `resolveSafeOutboundTarget` so it rejects only `REFUSED_HOST` (`internal.example.test`) and records every URL it is asked about in `mockChecked`.
- **`jest.mock('@infrastructure/observability/audit', …)`** — Replaces the audit module with `auditPortMock()` from the test ports; exposes `mockEmitAuditEvent` for assertions.
- **`REFUSED_HOST`** — The hostname the replaced SSRF guard rejects, standing in for a private/unresolvable address.
- **`mockChecked`** — Array collecting every URL passed to the guard; reset in `beforeEach`.
- **`context`** — A manager-role tenant caller used as the default request context.
- **`auditedAs(action)`** — Filters `mockEmitAuditEvent` calls to events matching a given action string.
- **`outsideTheEnum(...names)`** — Casts arbitrary `string[]` to `WebhookEventFilter[]` so tests can feed invalid event names straight into the service.
- **`subscribe(url?, eventTypes?)`** — Calls `create` via the service and returns the subscription document (throws on failure).
- **`stored(id)` / `ringIds(id)` / `read(id, key)`** — Read-back helpers against `webhookSubscriptionRepository` for assertions on persisted state.
- **`describe('listing')`** — Tenant isolation, `enabled` / `autoDisabled` filters, sort ordering, and per-caller action permissions.
- **`describe('reading one')`** — `getById` for own, unknown, and foreign-tenant ids.
- **`describe('what a create refuses')`** — Unknown event types (422), SSRF-refused URL (422, no leaked detail, `logger.warn` fired), subscription cap (409, guard never called).

## Relationships

- **`src/modules/webhooks/services/subscriptions.ts`** — The unit under test; all service functions (`create`, `list`, `getById`, `enable`, `disable`, `remove`, `createSecret`, `removeSecret`, `update`) are imported and exercised.
- **`src/modules/webhooks/services/catalog.ts`** — `registerWebhookCatalog(['orders'])` in `beforeEach` defines which event types are valid; cleared to `[]` in `afterEach`.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository` and `webhookDeliveryRepository` are used directly to seed foreign-tenant rows and to assert persisted state (secret ring, `autoDisabled` flag).
- **`src/modules/webhooks/secrets.ts`** — `mintRingSecret()` generates a valid secret-ring entry for test fixtures.
- **`src/modules/webhooks/audit.ts`** — `webhookSubscriptionAuditActions` imported for audit-action name constants.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` spied to verify SSRF-refusal logging carries `reason: 'unsafe-address'`.
- **`src/infrastructure/observability/audit.ts`** — Fully mocked via port; `mockEmitAuditEvent` used to assert audit events per action.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the real database before the suite runs.
- **`tests/support/callers.ts`** — `callerAs('manager')` constructs the tenant caller context.
- **`tests/support/environment.ts`** — `setEnvironment` toggles `NODE_WEBHOOK_SUBSCRIPTION_CAP` for the limit test.
- **`src/types/index.ts`** — `WebhookEventFilter` type used in assertions and the `outsideTheEnum` cast.

## Notes

- The SSRF guard is **replaced** (via `jest.mock` with a partial override), not spied on, because the real implementation depends on DNS resolution infrastructure that belongs to the `tests/fuzz/` suite.
- The audit module is **replaced at the port** rather than spied, because `recordAudit` in the service closes over its own module-level `emitAuditEvent` — a spy would not intercept it.
- `mockChecked` is deliberately prefixed with `mock` so that the hoisted `jest.mock` factory can reference it (Jest hoists `jest.mock` calls above variable declarations; the `mock*` convention signals the factory is allowed to close over it).
- `outsideTheEnum` performs a deliberate `string[] → WebhookEventFilter[]` cast; this is the only type-assertion trick in the file and exists solely to feed the service's own catalogue check invalid values.
- The subscription-cap test asserts `mockChecked` is empty, proving the guard is short-circuited when the cap is hit.
- The suite is **integration** (real DB via `setupTestDb`), not unit; it runs slower but verifies persistence, tenant scoping, and ordering against actual query results.
