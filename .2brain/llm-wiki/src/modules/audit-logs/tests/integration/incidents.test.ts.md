---
source: src/modules/audit-logs/tests/integration/incidents.test.ts
sha256: 060cff2306e561658b86a71bec53cf8703a883de707577e910b04228018920f6
generated_at: 2026-10-29T03:18:52.915421+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/tests/integration/incidents.test.ts

## Purpose

Integration tests for the operator-facing `searchIncidents` read path. They pin the exact allow-list of actions the platform operator may see (security failures, failed sign-ins, credential-attack signals) and, equally explicitly, the actions that must be withheld (customer orders, admin actions on customers, successful sign-ins, shop-internal role-protection rows). They also verify that raw IP addresses are replaced by a keyed HMAC digest in the operator view while remaining untouched in the admin view.

## Key elements

- **`row(action, outcome, extra?)`** — builds a `Partial<AuditLogDocument>` with standard actor/timestamp/level fields; `level` is `'warn'` for failures, `'info'` otherwise.
- **`seed(rows: [string, 'success' | 'failure'][])`** — creates one repository row per `[action, outcome]` pair via `auditLogRepository.create`.
- **`seenByOperator()`** — calls `auditLogService.searchIncidents({})`, flattens the page to a sorted array of `action:outcome` strings for concise assertions.
- **`describe` "what it shows"** — seeds nine failure rows and asserts all nine appear.
- **`describe` "what it withholds"** — covers: successful `auth.login` hidden while failed one is shown; ten customer/admin actions all filtered out; a `security.forbidden` row whose `metadata.reason === 'role_protected'` (with `ownerId`) is excluded while other `security.forbidden` rows are kept; `page.meta.totalItems` reflects only incidents; operator-supplied filters AND with the allow-list rather than widening it.
- **`describe` "addresses"** — same IP → same 12-hex-char `hmac:` digest, different IP → different digest, raw IP never leaks; rows without an `ip` field are returned as-is; the admin `search()` path still returns the raw IP.

## Relationships

- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is invoked at module top-level to provision an in-memory database before any test runs.
- **`src/modules/audit-logs/service.ts`** — the system under test; `searchIncidents()` is the operator read, `search()` is the admin read (used once to confirm no digest side-effect).
- **`src/modules/audit-logs/repository.ts`** — `auditLogRepository.create()` is the write path used to seed fixtures.
- **`src/modules/audit-logs/model.ts`** — provides the `AuditLogDocument` type that shapes the `row()` helper and the `extra` parameter.

## Notes

- Both the allowed and the withheld sets are pinned by full action string, not by prefix — the comment block explicitly warns that a prefix match would be insufficient (e.g. `auth.*` includes both shown and withheld actions).
- The `role_protected` carve-out: a `security.forbidden:failure` row is withheld *only* when `metadata.reason` is `'role_protected'` (or `'missing_permission'`) and `metadata.ownerId` is set, i.e. it names a specific shop account. Rows with no `metadata` pass through.
- The HMAC digest format asserted is `hmac:` followed by exactly 12 lowercase hex characters (`/^\d[a-f]{12}$/` — note the first char is a decimal digit, the remaining twelve are hex).
- `setupTestDb()` is a side-effecting call at module scope; tests in this file do not tear down explicitly, relying on the helper's own lifecycle.
