---
source: src/modules/users/tests/unit/audit.test.ts
sha256: df5ff73d126ad0e93b97d2da4ad55dc4543091f417c0eb2f3a7cc0bcc380d96c
generated_at: 2026-09-23T19:36:25.322255+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/unit/audit.test.ts

## Purpose

Pin-tests the audit action string map so that any accidental addition, removal, or rewording of an action constant is caught immediately. The strings are a wire contract consumed by external log queries, dashboards, and alerting, so drift would silently break downstream tooling.

## Key elements

- **`describe('the users audit vocabulary', …)`** — single suite scoping the test to the `usersAuditActions` export.
- **`it('spells every action exactly as the log tooling expects', …)`** — asserts `usersAuditActions` via `toEqual` against a hard-coded object of seven key–value pairs (`ADMIN_USER_CREATED` … `ADMIN_USER_UNBANNED`). Because the comparison is whole-object, any extra key, missing key, or altered string value causes a failure.

## Relationships

- **`src/modules/users/audit.ts`** — sole import target; provides the `usersAuditActions` constant object that this test asserts on. No other files are referenced.

## Notes

- The test uses `toEqual` (deep, whole-object equality) deliberately. Switching to `toMatchObject` or individual `toBe` checks would silently allow new actions to be added without updating the snapshot, defeating the purpose of the pin.
- There is no mock, no async setup, and no teardown — the test is purely a static assertion on a literal object.
- The seven actions cover the full admin lifecycle (create, update, soft-delete, erase, 2FA-disable, ban, unban). If a new admin action is added to `audit.ts`, this test must be updated in the same PR.
