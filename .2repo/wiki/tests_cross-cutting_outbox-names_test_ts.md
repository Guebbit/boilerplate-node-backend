# tests/cross-cutting/outbox-names.test.ts

## Purpose

Validates that every outbox mail name published by `src/modules/*/emails.ts` is a stable, cross-repo identifier: extension-free, kebab-case, two-segment, collision-free, resolvable to a real template file, and matching the exact set the paired PHP/Laravel backend also publishes. The names are shared with the frontend's e2e specs (which run against both backends), so any backend-specific detail in a name breaks the other side.

## Key elements

- **`listEmailFiles()`** — walks `src/modules/` and returns every directory that contains an `emails.ts`.
- **`templateAssignments(source)`** — filters source lines to those matching `template:` (used to detect non-literal values).
- **`namesIn(source)`** — extracts the literal string after `template: '…'` via regex.
- **`publishedNames()`** — composes the three helpers above into a flat list of `{ module, name }` pairs; every test case reads from this.
- **Test cases (6):**
  1. *Canary* — asserts ≥ 8 names across ≥ 4 modules so a rename/field change doesn't make the sweep vacuous.
  2. *Literal-only* — fails if any `template:` line is not a plain quoted string (no variables, template literals, or helper calls).
  3. *No file extension* — name must match `^[a-z][\da-z-]*\.[a-z][\da-z-]*$` (two kebab-case segments, no suffix like `.ejs` or `.blade`).
  4. *No collisions* — no two modules may publish the same name.
  5. *Resolvable* — `templateFile(name)` must point to an existing file (catches typos that only surface as EJS ENOENT at send time).
  6. *Agreed set* — the published names, sorted, must equal a hardcoded list of 9 (the pair's shared contract).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports `templateFile`, the single point where a bare name becomes a filesystem path (appends `.ejs` and resolves against the templates directory). Used in test 5 to verify each name still maps to a real file.

## Notes

- The test reads **source text** (regex over `emails.ts` files), not runtime exports. A name built at runtime is invisible to it — which is why test 2 enforces literals.
- `path.extname` is explicitly unusable for validation: names are dotted by design (`account.verify-request`), so it would misread the event segment as an extension.
- `account.setup-request` is backend-only as of 2026-08-28 and is **not** yet in the PHP twin's `OutboxNamesTest.php`; it is included in the hardcoded agreed list here but flagged in `HANDOFF.md` §2.22.
- The "agreed set" is stated (not derived) because the counterpart lives in a repository this test cannot import.
