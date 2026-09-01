# src/modules/locales/tests/unit/audit.test.ts

## Purpose

Unit tests that pin the exact string values of the locales audit-action vocabulary. The strings are a wire contract consumed by external log queries, dashboards, and alert rules, so any accidental rename or reformat would break tooling outside the repo. The tests also guard the underscore-in-two-word-nouns convention and confirm the TypeScript module augmentation actually registers the actions into the app-wide `AuditAction` union.

## Key elements

- **`describe('the locales audit vocabulary')`** — single suite containing three assertions.
- **First `it` (spelling)** — asserts `localeAuditActions` equals the full expected object literal (7 keys, `admin.locale.*` / `admin.locale_entry.*` values).
- **Second `it` (underscore convention)** — iterates every value and asserts none contains a hyphen, catching a `locale-entry` regression that would fail the cross-cutting `noun.noun.verb` sweep.
- **Third `it` (union registration)** — assigns a locale action to a variable typed as `AuditAction`; if the `declare module` augmentation were removed, this line would be a compile error rather than a runtime failure at call sites.

## Relationships

- **`src/modules/locales/audit.ts`** — the file under test; exports `localeAuditActions` (the object whose values are asserted) and the `declare module` augmentation that widens `AuditAction`.
- **`src/infrastructure/observability/audit.ts`** — provides the base `AuditAction` type imported for the third test's type-level assertion.

## Notes

- The file-header comment explicitly warns: these strings are **not** just identifiers. Renaming a value is a breaking change to external observability tooling even if the repo still compiles.
- The cross-cutting shape test lives separately in `tests/cross-cutting/audit-actions.test.ts`; this file asserts the *values* (ownership), the cross-cutting file asserts the *pattern* (naming rule).
- Removing the `declare module` augmentation in `audit.ts` does not break this test file in isolation (it still compiles), but `emitAuditEvent` call sites lose their type-safety. The third `it` block is the local safety net for that.
