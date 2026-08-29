# tests/cross-cutting/outbox-names.test.ts

## Purpose

Cross-cutting test that validates every outbox `template` name published by the modules in `src/modules/*/emails.ts`. It enforces the naming contract shared with the PHP twin backend (boilerplate-php-laravel-backend): names must be extension-free, unique, literal, well-formed, resolve to real template files, and match the exact agreed set. It exists because the names are a cross-repository identifier consumed by shared e2e specs, and a violation here silently breaks the other backend's tests.

## Key elements

- **`listEmailFiles()`** — discovers every `src/modules/<name>/emails.ts` by scanning the modules directory; no hardcoded list.
- **`templateAssignments(source)`** — extracts all lines matching `template:` from a source string (for the literal-check case).
- **`namesIn(source)`** — extracts the literal string value from each `template: '…'` assignment via regex.
- **`publishedNames()`** — combines the above into a flat array of `{ module, name }` pairs; the single source of truth all cases read from.
- **Canary case** (`finds the mails it means to check`) — asserts the discovery actually found ≥ 8 names across ≥ 4 modules, preventing a vacuous pass.
- **Literal check** — every `template:` assignment must be a bare string literal, not a variable or expression.
- **Extension-free / shape check** — enforces `<module>.<event>` (two kebab-case segments, no dot beyond the middle one). Deliberately uses a shape regex rather than `path.extname`, which misreads the event segment as an extension.
- **Uniqueness check** — no two modules publish the same name.
- **Resolution check** — every name, after `templateFile()` appends the engine suffix, must correspond to an existing file on disk.
- **Agreed-set check** — the full published list must equal a hardcoded array of 9 names (including the known `account.registration-confirm` divergence).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — the test imports `templateFile` from this module. The resolution check calls `templateFile(name)` to compute the final path and then asserts the file exists on disk. This is the single point where the engine-specific suffix (`.ejs`) is appended, which is the whole reason the names themselves must stay extension-free.

## Notes

- All cases read **source text** via `readFileSync` + regex rather than importing the modules. This is intentional: a runtime-computed name would be invisible to the sweep, and the literal check explicitly forbids that.
- `path.extname` is a known trap here — names are dotted by design (`account.verify-request`), so it returns `"-request"` as the "extension." The shape regex is the correct tool.
- The agreed-set list is a **hardcoded mirror** of what the PHP twin publishes. It cannot be derived automatically; it is maintained by hand against `tests/CrossCutting/OutboxNamesTest.php` in the sibling repo.
- `account.registration-confirm` is a recorded divergence (present here, absent in the twin). It is documented in HANDOFF.md and must not be removed from the test list without also deleting the mail itself.
- The file header comment is the authoritative design rationale for why extensions were stripped and what guarantee was lost in the process.
