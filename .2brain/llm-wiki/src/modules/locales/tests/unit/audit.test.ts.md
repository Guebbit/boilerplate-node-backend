---
source: src/modules/locales/tests/unit/audit.test.ts
sha256: c865598fce0efc483b17d396f1e64cb2edc7e235c427298a1f5ab26cff511edb
generated_at: 2026-09-23T18:54:06.421154+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/audit.test.ts

## Purpose

Unit test that pins the exact string values of the locales audit-action vocabulary. Because these strings are a wire contract consumed by external log queries, dashboards, and alert rules, this file acts as the owner-level assertion: if a value is renamed, this test breaks before the string ships.

## Key elements

- **`describe('the locales audit vocabulary')`** — top-level suite.
- **`it('spells every action exactly as the log tooling expects')`** — asserts `localeAuditActions` equals a hard-coded object of 8 `noun.noun.verb` strings (e.g. `ADMIN_LOCALE_ENTRY_IMPORTED: 'admin.locale_entry.imported'`).
- **`it('spells its two-word noun with an underscore, as the sweep requires')`** — iterates all values and asserts none contain a hyphen, catching the common mistake of writing `locale-entry` instead of `locale_entry`.

## Relationships

- **`src/modules/locales/audit.ts`** — the only import; provides `localeAuditActions`, the object under test.
- Referenced (not imported): `tests/cross-cutting/audit-actions.test.ts` is cited in the module doc-comment as the place that proves the *shape* (key count, naming pattern); this file proves the *values*.

## Notes

- The strings are intentionally pinned verbatim, not matched by pattern. A rename in `audit.ts` will fail here even if the new string is structurally valid, because downstream tooling is not refactored in lockstep.
- The underscore assertion exists because the cross-cutting sweep enforces lower snake_case (`noun.noun.verb`); the hyphenated form (`locale-entry`) would pass a naïve "does it look right?" review but fail the sweep. This test catches that at the point where a developer renaming the noun would be looking.
