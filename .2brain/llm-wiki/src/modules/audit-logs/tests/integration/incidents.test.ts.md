---
source: src/modules/audit-logs/tests/integration/incidents.test.ts
sha256: 47c51576a23379f35d152494e3dca00189a2eaf57b53ee0fdf1629ba42380d4b
generated_at: 2026-11-08T05:09:46.548217+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/integration/incidents.test.ts

## Purpose

Integration tests for the operator-facing `searchIncidents` endpoint. They pin the exact allow-list of `(action, outcome)` pairs that are visible, verify that customer-activity rows are withheld, confirm that raw IP addresses are replaced with keyed HMAC digests, and ensure that pagination metadata and operator-supplied filters never widen the allow-list.

## Key elements

- **`row(action, outcome, extra?)`** – Builds a minimal `AuditLogDocument` with fixed actor fields, a derived `level`, and a spread of overrides.
- **`seed(pairs)`** – Creates one stored row per `[action, outcome]` tuple via `auditLogRepository.create`.
- **`seenByOperator()`** – Calls `auditLogService.searchIncidents({})` and returns the sorted `action:outcome` strings of the returned page.
- **`describe` blocks** – Three groups: *"what it shows"* (positive allow-list), *"what it withholds"* (negative exclusions, page-total isolation, filter-AND semantics), and *"addresses"* (IP digest shape, pass-through when absent, admin-read unaffected).

## Relationships

- **`src/modules/audit-logs/service.ts`** – Provides `auditLogService`; the tests call `searchIncidents` (operator path) and `search` (admin path) to assert visible vs. hidden rows.
- **`src/modules/audit-logs/repository.ts`** – Provides `auditLogRepository.create` used to seed the test database with known rows.
- **`src/modules/audit-logs/model.ts`** – Supplies the `AuditLogDocument` type that shapes the `row()` helper and the fields under test.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is invoked at module load to create an isolated test database before any test runs.

## Notes

- The allow-list is per **`(action, outcome)` pair**, not per action prefix. The module doc comment stresses that a prefix rule would be wrong (e.g., `auth.login:success` is hidden while `auth.login:failure` is shown).
- A `security.forbidden` row carrying `metadata.reason` and `metadata.ownerId` is treated as a shop-internal role-protection event and is **withheld**, while `security.forbidden` rows without that metadata shape are **shown**.
- IP digests match `^hmac:[\da-f]{12}$`; the same raw IP always yields the same digest, but distinct IPs yield distinct digests.
- The admin endpoint (`search`) is asserted to return the **raw** IP, confirming the digest is applied only on the operator path.
- `page.meta.totalItems` reflects only incident rows, not the full collection, so a page total cannot leak the volume of non-incident data.
