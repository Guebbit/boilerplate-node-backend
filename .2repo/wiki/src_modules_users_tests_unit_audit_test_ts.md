# src/modules/users/tests/unit/audit.test.ts

## Purpose

Unit test that pins the exact string values of `usersAuditActions` by asserting whole-object equality. These strings are wire contracts consumed by external log queries, dashboards, and alerting rules, so any addition, removal, or rename must fail CI before reaching production.

## Key elements

- **`usersAuditActions`** (imported from `../../audit`) — the object under test; a map of five symbol keys (`ADMIN_USER_CREATED`, `ADMIN_USER_UPDATED`, `ADMIN_USER_SOFT_DELETED`, `ADMIN_USER_ERASED`, `ADMIN_USER_2FA_DISABLED`) to dotted action strings (e.g. `'admin.user.created'`).
- **`describe('the users audit vocabulary')` / `it(...)`** — a single test case that calls `expect(usersAuditActions).toEqual({...})`, asserting the entire object shape and every value in one comparison.

## Relationships

- **`src/modules/users/audit.ts`** — sole dependency. Provides the `usersAuditActions` export that this test imports and validates.

## Notes

- The assertion uses `toEqual` (whole-object equality), not per-key checks. This means adding a new action, removing one, or changing any string value will fail the test — intentional, to force a conscious update here alongside the source.
- The test file's JSDoc explicitly states the strings are read by tooling *outside this repo*; treat them as an external API, not just internal constants.
- There is no mocking, no async setup, and no other imports. The test is fully synchronous and self-contained.
