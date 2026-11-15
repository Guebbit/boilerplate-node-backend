---
source: src/modules/webhooks/tests/integration/subscription-lifecycle.test.ts
sha256: 6ee0d6bb2deebe91b1348c7c0931533f44696c8e405793c7db833f0af51554c6
generated_at: 2026-11-14T22:51:06.141324+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/subscription-lifecycle.test.ts

## Purpose

Integration test suite for the webhook subscription service, exercised against a real database via `setupTestDb`. It pins the same outcomes as the HTTP-level contract suite but at the service boundary: listing, single-read, create refusal (bad event types, SSRF, tenant cap), and (per the module doc) update, secret ring, and removal. The SSRF guard is replaced with a deterministic stub so no network lookup occurs.

## Key elements

- **`REFUSED_HOST`** – Hostname (`internal.example.test`) the stubbed SSRF guard rejects, standing in for a private/unresolvable address.
- **`mockChecked`** – Array (prefixed `mock` so the hoisted `jest.mock` can close over it) recording every URL passed to the replaced guard.
- **`jest.mock('@infrastructure/adapters/ssrf-guard')`** – Replaces `resolveSafeOutboundTarget`: rejects `REFUSED_HOST` with `SsrfRefusedError`, resolves all others to `203.0.113.9`.
- **`jest.mock('@infrastructure/observability/audit')`** – Replaces the audit port entirely (not spied) so `emitAuditEvent` becomes a `jest.MockedFunction` the tests can assert on.
- **`context`** – A manager-role caller with `analyticsConsent: false`, the default identity for most tests.
- **`auditedAs(action)`** – Filters `emitAuditEvent` mock calls by `event.action`.
- **`outsideTheEnum(...names)`** – Casts arbitrary strings to `WebhookEventFilter[]` so invalid names can be fed to the service to exercise its validation path.
- **`subscribe(url?, eventTypes?)`** – Calls `create` via the service and throws on failure; the standard way to seed a row.
- **`stored(id)` / `read(id, key)` / `ringIds(id)`** – Read the persisted document (or a single field / secret-entry ids) directly from the repository.
- **`describe('listing')`** – Tenant isolation, enabled/disabled filter, `autoDisabled` distinction, sort order, and per-caller action flags.
- **`describe('reading one')`** – `getById` returns the row, `undefined` for unknown or foreign-tenant ids.
- **`describe('what a create refuses')`** – 422 for unknown event types, 422 for SSRF-refused URL (verifies generic message, no leak of internal detail, `logger.warn` called), 409 `WEBHOOK_SUBSCRIPTION_LIMIT_REACHED` when cap is hit (verifies guard was never consulted).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/webhooks/services/subscriptions.ts` | All service functions (`create`, `list`, `getById`, `disable`, `enable`, `remove`, `update`, `createSecret`, `removeSecret`) are the unit under test. |
| `src/modules/webhooks/services/catalog.ts` | `registerWebhookCatalog(['orders'])` in `beforeEach` controls which event types are valid; cleared to `[]` in `afterEach`. |
| `src/modules/webhooks/repository.ts` | `webhookSubscriptionRepository` used directly to seed foreign-tenant rows, read stored documents, and apply `disable` to simulate the failure guard. `webhookDeliveryRepository` imported (used in truncated portion). |
| `src/modules/webhooks/model.ts` | `WebhookSubscriptionDocument` type constrains the generic `read` helper. |
| `src/modules/webhooks/secrets.ts` | `mintRingSecret` generates a valid secret entry when seeding foreign-tenant documents. |
| `src/modules/webhooks/audit.ts` | `webhooksAuditActions` imported (referenced in truncated portion, likely for audit-action assertions). |
| `src/infrastructure/observability/audit.ts` | Fully mocked; `emitAuditEvent` becomes the assertable audit spy. |
| `src/infrastructure/adapters/logger.ts` | The `logger` export is spied on (`logger.warn`) to verify SSRF-refusal is logged without real output. |
| `src/types/index.ts` | `WebhookEventFilter` type for filter arrays. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` provisions and tears down a real database per run. |
| `tests/support/callers.ts` | `callerAs('manager')` builds the role-based caller identity. |
| `tests/support/environment.ts` | `setEnvironment` sets `NODE_WEBHOOK_SUBSCRIPTION_CAP` for the limit test. |

## Notes

- The SSRF guard is **replaced**, not spied: the service calls `resolveSafeOutboundTarget` directly, so a partial spy would still perform a real DNS lookup.
- The audit port is **replaced**, not spied, because `recordAudit` inside the service closes over its own module-scoped `emitAuditEvent`; a `jest.spyOn` on the imported binding would miss internal call sites.
- `mockChecked` must carry the `mock` prefix so that Jest's `jest.mock` hoisting can reference it inside the factory function (otherwise it is `undefined` at mock-evaluation time).
- `outsideTheEnum` is an intentional `as` cast; the strings are *not* valid `WebhookEventFilter` values, and the test relies on the service's runtime check to reject them.
- The suite asserts that the SSRF-refusal error message contains **no** internal detail (e.g. the words "private address"), protecting against information leakage.
- The cap-reached test asserts `mockChecked` is empty after the 409, proving the guard was never consulted once the limit short-circuits.
