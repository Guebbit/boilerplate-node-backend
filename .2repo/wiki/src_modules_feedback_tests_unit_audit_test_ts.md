# src/modules/feedback/tests/unit/audit.test.ts

## Purpose

Pins the exact string values of the feedback module's audit action constants. Because these strings are a **wire contract** consumed by external log queries and alerts, a rename would type-check cleanly but silently break alerting. This test is the value-level guard that the cross-cutting (shape-only) suite does not provide.

## Key elements

- **`describe('the feedback audit vocabulary')`** — the sole test suite in the file.
- **`it('spells every action exactly as the log tooling expects')`** — asserts `feedbackAuditActions` equals the literal object `{ ADMIN_FEEDBACK_VIEWED: 'admin.feedback.viewed', ADMIN_FEEDBACK_STATUS_UPDATED: 'admin.feedback.status_updated' }`.
- **`it('registers its actions in the app-wide union')`** — assigns `feedbackAuditActions.ADMIN_FEEDBACK_VIEWED` to a variable typed as `AuditAction`, proving the `declare module` augmentation in `audit.ts` is present (caught at `tsc` time, not at jest runtime).

## Relationships

- **`src/infrastructure/observability/audit.ts`** — exports the `AuditAction` type (a union of strings). This test imports it to type-check that feedback actions are members of that union.
- **`src/modules/feedback/audit.ts`** — exports `feedbackAuditActions` (the object under test) and contains the `declare module` augmentation that injects feedback action literals into `AuditAction`. This test is the owner-level assertion for those values.

## Notes

- The second test (`registers its actions in the app-wide union`) is a **compile-time** check. Jest does not type-check; the guarantee comes from `tsconfig.json` including the whole `src` tree, so the assignment is compiled by `tsc` even though it never executes in a meaningful way under jest.
- If you rename a key or value in `audit.ts`, this test fails immediately. Without it, the rename would pass CI (type-safe) while breaking downstream alert rules.
