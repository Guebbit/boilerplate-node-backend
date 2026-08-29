# src/modules/feedback/tests/unit/audit.test.ts

## Purpose

Unit test that pins the feedback module's audit action strings to their exact wire-contract values and verifies they are registered in the app-wide `AuditAction` union. It exists because these strings are read by external log tooling, dashboards, and alert rules that do not get refactored alongside this codebase.

## Key elements

- **`describe('the feedback audit vocabulary')`** — top-level suite for the feedback module's audit vocabulary.
- **`spells every action exactly as the log tooling expects`** — asserts `feedbackAuditActions` with whole-object `toEqual`, locking both the constant names and their string values (`'admin.feedback.viewed'`, `'admin.feedback.status_updated'`). Catches value changes *and* actions added or removed without a deliberate decision.
- **`registers its actions in the app-wide union`** — assigns `feedbackAuditActions.ADMIN_FEEDBACK_VIEWED` to a variable typed as `AuditAction`. This is a compile-time check that the `declare module` augmentation in `audit.ts` is present; it fails at type-check time, not at test-run time.

## Relationships

- **`src/modules/feedback/audit.ts`** — module under test; exports `feedbackAuditActions` and contains the `declare module` augmentation that adds feedback actions to the global `AuditAction` type.
- **`src/infrastructure/observability/audit.ts`** — provides the `AuditAction` type imported (type-only) by this test to verify union registration.

## Notes

- The string values are **wire contracts**, not internal identifiers. Renaming the constant is a safe refactor; changing the string silently breaks external alert rules with no local signal.
- Whole-object `toEqual` is deliberate: it fails on a changed value *and* on a missing/extra key, forcing a conscious decision to update this test when the vocabulary changes.
- The second test is validated **at type-check time only** (`tsconfig.json` compiles the whole `src` tree). Jest itself does not type-check, so a broken augmentation won't show up as a runtime test failure.
- Value assertions live here (module owner) rather than in `tests/cross-cutting/audit-actions.test.ts`, which only checks shape (presence, uniqueness, naming convention) to avoid coupling every domain into one file.
