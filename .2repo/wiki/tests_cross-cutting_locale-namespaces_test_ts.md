# tests/cross-cutting/locale-namespaces.test.ts

## Purpose

Guards the locale namespace boundaries across modules. Because `infrastructure` deep-merges every module's `locales/en.json` onto the shared dictionary at boot (last-writer-wins), a key collision or accidental shadowing produces silently wrong copy rather than an error. This test catches both failure modes and enforces that each module's keys live under its own namespace prefix.

## Key elements

- **`flatten(value, prefix?)`** – Recursively extracts every dotted leaf key (e.g. `account.email.reset-request.subject`) from a nested dictionary.
- **`readDictionary(file)`** – Reads and JSON-parses a locale file from disk.
- **`moduleKeys()`** – Discovers every `src/modules/<name>/locales/en.json` on the filesystem and returns a `Map<moduleName, string[]>` of flattened keys. Modules without a locale file are simply absent.
- **`describe('locale namespaces across modules')`** – Four test cases:
  - *canary* – asserts the module directory is non-empty and at least one locale file was found (prevents a silent no-op sweep).
  - *shared-key shadowing* – no module may redefine a key that exists in `src/locales/en.json`.
  - *inter-module collision* – no two modules may claim the same dotted key.
  - *namespace ownership* – every key a module ships must start with `"<module-name>."`.

## Relationships

No import-level graph neighbors. The test reads files from disk (`src/modules/*/locales/en.json`, `src/locales/en.json`) rather than importing runtime modules. The file header references `tests/unit/i18n/validation-messages.test.ts` as the sibling that covers cross-locale key parity (every locale declaring the same keys), so this file deliberately does not re-check parity.

## Notes

- **Filesystem-based, not import-based.** The test resolves paths relative to `__dirname` and reads JSON directly; it never imports the merge logic or the dictionaries. This means it validates the *source layout*, not the merged runtime output.
- **Canary is against disk, not a count.** The first assertion checks `readdirSync(MODULES_ROOT).length > 0` rather than pinning an expected module count, so adding or removing a domain module won't break this test.
- **Deep-merge semantics are last-writer-wins.** The collision test is ordered by `readdirSync` (alphabetical on most platforms); the "later wins" behavior means the *earlier* module's string is the one silently lost, which is why the test reports both owners.
- **Language parity is out of scope here.** Only `en.json` is inspected per module; verifying that `fr.json`, `de.json`, etc. declare identical key sets is handled by `validation-messages.test.ts` against the merged dictionaries.
