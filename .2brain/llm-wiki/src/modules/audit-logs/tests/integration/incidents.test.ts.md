---
source: src/modules/audit-logs/tests/integration/incidents.test.ts
source_sha256: 72e8960e26f09ff75564df1ab9dbf9eb1fbf67f88353b0f7567455f20fdceb17
context_sha256: ed23ce0b386ec1c0cd7480db174a1199f4ddc67c8e2571b01b868baa9a34e056
generated_at: 2026-11-22T04:28:35.049238+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/tests/integration/incidents.test.ts

## Purpose
Integration tests for the platform operator's audit read (`auditLogService.searchIncidents`). They pin which audit rows the operator sees (an explicit allow-list of incident actions) and which are withheld (anything naming what a shop's customers did), and that IP addresses leave only as a keyed digest. The allow-list is tested by spelling out exact action strings, because a prefix rule would be wrong: failed logins live under `auth.*`, and `system.user.*` carries customer ids.

## Key elements
- `setupTestDb()` — called at module level to set up the test database.
- `row(action, outcome, extra)` — builds a partial `AuditLogDocument` with default actor, scope, timestamp and a level derived from the outcome (`warn` for failure, `info` for success).
- `seed(rows)` — creates one row per `[action, outcome]` pair through `auditLogRepository.create`.
- `seenByOperator()` — runs `searchIncidents({})` and returns the sorted `action:outcome` strings.
- **"what it shows"** — these failure rows are visible:
  - `security.token.invalid_signature`, `security.forbidden`, `security.rate_limit_hit` and `security.reauth_required`.
  - `auth.login`, `auth.two_factor.challenge_failed`, `auth.oauth.failed` and `auth.refresh_token.reuse_detected`.
  - `system.webhook_subscription.auto_disabled`.
- **"what it withholds"**:
  - A successful `auth.login` is hidden while the failed one is shown.
  - Order, payment, admin, `system.user.*`, signup, password-change and role-assignment rows are all hidden.
  - A `security.forbidden` row with `metadata.reason === 'role_protected'` is hidden. Other reasons and no metadata stay visible.
  - `meta.totalItems` counts only incidents.
  - An operator filter such as `action: 'order.created'` is ANDed with the allow-list and returns nothing.
- **"addresses"**:
  - `ip` comes back as `hmac:<12 hex chars>`, identical for the same address and different for different ones.
  - The raw address does not appear in the output.
  - A row with no `ip` has no `ip` property.
  - `auditLogService.search({})` still returns the raw IP.

## Relationships
- `src/modules/audit-logs/service.ts` — the service under test. The file imports `auditLogService` from it and exercises its `searchIncidents` read, plus `search` as the admin-read control.
- `src/modules/audit-logs/repository.ts` — the file imports `auditLogRepository` from it and uses its `create` to seed rows directly, bypassing the service.
- `src/modules/audit-logs/model.ts` — supplies the `AuditLogDocument` type used by the row builder.
- `tests/support/setup-test-db.ts` — provides `setupTestDb` for the database lifecycle.

## Notes
- Assertions on lists sort results (`toSorted`) because seeds are created concurrently with `Promise.all`, so insertion order is not guaranteed.
- Most tests share `actorUserId: 'user-1'`. Rows are told apart by `requestId` when it matters.
