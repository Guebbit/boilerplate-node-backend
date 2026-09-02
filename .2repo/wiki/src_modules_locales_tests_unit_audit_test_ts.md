# src/modules/locales/tests/unit/audit.test.ts

## Purpose

Unit tests that pin the exact string values of `localeAuditActions` exported by `src/modules/locales/audit.ts`. These strings are a wire contract consumed by external log queries, dashboards, and alert rules; the tests lock them in place so a rename or reformat cannot silently break downstream tooling.

## Key elements

- **`it('spells every action exactly as the log tooling expects')`** — asserts `localeAuditActions` is deep-equal to a hard-coded object of seven `ADMIN_LOCALE_*` keys mapped to dotted snake-case strings (e.g. `admin.locale_entry.created`).
- **`it('spells its two-word noun with an underscore, as the sweep requires')`** — iterates every value and asserts none contain a hyphen, enforcing the `noun.noun.verb` lower snake-case shape mandated by the cross-cutting sweep.

## Relationships

- **`src/modules/locales/audit.ts`** — sole import; provides the `localeAuditActions` constant under test.
- **`tests/cross-cutting/audit-actions.test.ts`** (referenced in the module doc-comment, not imported) — proves the structural *shape* of audit actions repo-wide; this file asserts the *values* from the owner's perspective.

## Notes

- The doc-comment explicitly frames these strings as a **wire contract**, not internal identifiers. Treat any change to a value as a breaking change for external consumers.
- The underscore-vs-hyphen rule is not cosmetic: a cross-cutting sweep enforces `noun.noun.verb` in lower snake_case, so `locale-entry` (the natural spelling of the two-word noun) would fail it. The second test exists as a second line of defense at the point where a developer renaming the noun would most likely look.
- The file imports from `../../audit`, i.e. `src/modules/locales/audit.ts`, resolving through the test directory's relative path.
