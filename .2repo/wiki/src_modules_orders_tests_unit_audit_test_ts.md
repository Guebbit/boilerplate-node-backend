# src/modules/orders/tests/unit/audit.test.ts

## Purpose

Single-test guard that pins the exact key-and-value shape of the `ordersAuditActions` vocabulary to the string literals expected by downstream log-query and alert-rule tooling outside this repository. It exists so that a value rename, a new action, or a removed action all fail CI loudly rather than silently breaking external consumers.

## Key elements

- **`describe('the orders audit vocabulary')`** — sole suite; scopes the test to the audit-string contract.
- **`it('spells every action exactly as the log tooling expects')`** — asserts `ordersAuditActions` deep-equals a hardcoded object with four entries (`ORDER_CREATED: 'order.created'`, `ORDER_UPDATED: 'order.updated'`, `ORDER_DELETED: 'order.deleted'`, `ORDER_CANCELLED: 'order.cancelled'`).
- **Import of `ordersAuditActions`** from `../../audit` — the only production symbol under test.

## Relationships

- **`src/modules/orders/audit.ts`** — source of the `ordersAuditActions` constant. This test is the sole consumer in the repo whose job is to freeze that export's shape and values.

## Notes

- The assertion uses `toEqual` (whole-object deep equality), not per-key checks. This intentionally fails on a *new* or *missing* key, not just a changed string — the JSDoc calls the vocabulary a "wire contract."
- There is exactly one test case; it is a snapshot-style contract guard, not a behavioral test. Adding a new audit action in `audit.ts` will break this test until the expected literal is updated here.
