# src/modules/locales/tests/unit/audit.test.ts

## Purpose

Unit test that pins the exact string values of the locales module's audit-action vocabulary. Because these strings are a wire contract consumed by log queries, dashboards, and alert rules outside this repo, this file asserts them by value rather than relying on the cross-cutting shape-only sweep. It also verifies the underscore-naming convention and that the actions land in the global `AuditAction` union.

## Key elements

- **`describe('the locales audit vocabulary')`** — the single suite; all assertions are about the `localeAuditActions` object imported from the module under test.
- **`it('spells every action exactly as the log tooling expects')`** — deep-equals `localeAuditActions` against the literal string map (7 actions: `admin.locale.{created,updated,deleted}`, `admin.locale_entry.{created,updated,deleted,imported}`).
- **`it('spells its two-word noun with an underscore…')`** — iterates all values and asserts none contain a hyphen, enforcing the `noun.noun.verb` lower-snake_case rule the cross-cutting sweep requires.
- **`it('registers its actions in the app-wide union')`** — assigns one action to a variable typed `AuditAction`, proving the `declare module` augmentation in `audit.ts` is intact and `emitAuditEvent` will accept it.

## Relationships

- **`src/modules/locales/audit.ts`** — the module under test; exports the `localeAuditActions` record that every assertion here inspects.
- **`src/infrastructure/observability/audit.ts`** — provides the `AuditAction` type (a global union augmented per module). The third test confirms the locales module's actions are members of that union.
- **`tests/cross-cutting/audit-actions.test.ts`** (sibling, not imported) — validates *shape* (presence, uniqueness, dotted lower-snake_case) across all modules. This file complements it by pinning the *values* for locales specifically.

## Notes

- The string values are **not** free to rename; they are read by external observability tooling. Renaming the constant keys is safe (a refactor); changing the string literals silently breaks dashboards and alerts.
- The underscore-vs-hyphen assertion is redundant with the cross-cutting sweep but intentionally kept here so a developer editing the locale noun sees the constraint at the point of change.
- The third test guards against a *type-level* failure: dropping the `declare module` augmentation still compiles the module in isolation but causes `emitAuditEvent` call sites to reject the actions at the call site, not at this test.
