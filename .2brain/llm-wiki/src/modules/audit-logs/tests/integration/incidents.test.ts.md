---
source: src/modules/audit-logs/tests/integration/incidents.test.ts
sha256: f6cb1abf6872776de6f42ca16c17105de297d91ef881668a105352509efe9b90
generated_at: 2026-10-14T15:06:26.011831+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/integration/incidents.test.ts

## Purpose

Integration tests that pin down exactly which audit-log rows the **operator's** incident read (`auditLogService.searchIncidents`) returns. They lock in the allow-list (security/auth failure rows) and the withholding (customer activity, shop-internal admin actions, successful logins), plus the HMAC-digest treatment of IP addresses — so that a future code change to the filter logic is caught immediately.

## Key elements

- **`row(action, outcome, extra?)`** — Factory that returns a `Partial<AuditLogDocument>` with sensible defaults (`actorUserId`, `actorRole: 'user'`, `actorScope: 'tenant'`, `level` derived from outcome). All other fields can be overridden via `extra`.
- **`seed(pairs)`** — Creates one audit-log document per `[action, outcome]` tuple via `auditLogRepository.create`, returning all creation promises.
- **`seenByOperator()`** — Calls `auditLogService.searchIncidents({})` and flattens the result to a sorted array of `"action:outcome"` strings for easy assertion.
- **`describe("what it shows")`** — Verifies the nine incident actions (security refusals, failed sign-in, attack signals, webhook auto-disable) all appear.
- **`describe("what it withholds")`** — Four sub-tests: successful logins hidden, all customer/admin-tenant actions hidden, shop-rank `security.forbidden` rows (those carrying `metadata.ownerId`) hidden while others remain, page `meta.totalItems` reflects only incidents, and operator-supplied filters are AND-ed (not OR-ed) with the allow-list.
- **`describe("addresses")`** — Confirms `ip` is replaced by an `hmac:<12-hex>` digest (stable per IP), absent rows stay absent, and the **admin** read (`search`) still sees the raw IP.

## Relationships

- **`src/modules/audit-logs/service.ts`** — The SUT. Tests call `auditLogService.searchIncidents()` (operator view) and `auditLogService.search()` (admin view) to verify filter and redaction behavior.
- **`src/modules/audit-logs/repository.ts`** — Used solely for seeding: `auditLogRepository.create(row(...))` persists fixture documents into the test database.
- **`src/modules/audit-logs/model.ts`** — Provides the `AuditLogDocument` type that `row()` constructs and that assertions read from.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called once at module top-level to provision and reset the test database before any test runs.

## Notes

- The module doc-comment at the top is normative: it explains *why* the allow-list is an explicit set of action strings rather than a prefix match (e.g. `auth.*` would wrongly include failed logins under `auth.*` while missing `security.*`, and `system.user.*` carries customer PII).
- The "shop-rank forbidden" test distinguishes rows by the presence of `metadata.ownerId`; rows with `reason` of `'outranked'`, `'own'`, `'own_role'`, or `undefined` are all created, but only the two without `ownerId` (`forbidden-2`, `forbidden-3`) survive the operator filter.
- IP digests are asserted against the regex `^hmac:[\da-f]{12}$`; the test confirms determinism (same IP → same digest) and that the raw address never leaks into operator output.
- `setupTestDb()` is called at the **module** level (outside any `describe`/`beforeAll`), so it runs once when the test file is imported by the runner.
