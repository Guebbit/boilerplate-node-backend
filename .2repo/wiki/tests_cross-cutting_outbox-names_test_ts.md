# tests/cross-cutting/outbox-names.test.ts

## Purpose

Static-analysis test that validates the `template:` names published by every module's `emails.ts`. These names are shared identifiers consumed by a paired frontend's e2e specs (which run against both this backend and a PHP/Blade twin), so they must be extension-free, collision-free, and resolvable to a real template file. The test reads source text rather than importing modules, keeping it independent of runtime wiring.

## Key elements

- **`listEmailFiles()`** — discovers every `src/modules/<name>/emails.ts` on disk (readdir + existsSync filter).
- **`namesIn(source)`** — regex-extracts all literal `template: '…'` values from a file's text.
- **`publishedNames()`** — flat-maps the above into `{ module, name }[]` for every module.
- **`'finds the mails it means to check'`** — canary: asserts ≥ 8 names across ≥ 4 modules so the other cases can't pass over an empty set.
- **`'states every name as a literal…'`** — fails if any `template:` line is a computed value (variable, template string, helper call).
- **`'keeps the names free of a file extension'`** — enforces the `^[a-z][\da-z-]*\.[a-z][\da-z-]*$` shape (two kebab-case segments, no engine suffix).
- **`'gives no two mails the same name'`** — detects duplicate names across modules.
- **`'points every name at a template that exists'`** — resolves each name through `templateFile()` and asserts the file is present on disk.
- **`'publishes the set the pair agreed on'`** — asserts the exact sorted list of 10 agreed names (two of which — `account.setup-request`, `account.inactivity-warning` — are not yet in the PHP twin).

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports `templateFile`, which appends the `.ejs` suffix to a bare name to produce the actual template file path. The "points every name at a template that exists" case calls this to verify resolution; it is the single choke-point where a name becomes a filesystem path.

## Notes

- The test is **pure static analysis**: it `readFileSync`s `emails.ts` files and regexes them. It does not import any module, so a name assembled at runtime would be invisible unless the "states every name as a literal" case catches it.
- `path.extname` is explicitly *not* usable for the extension check because names are dotted by design (`account.verify-request`); `extname` would misread `-request` as an extension.
- The agreed-set test hardcodes the expected list and is annotated with which two entries are pending in the PHP twin (`boilerplate-php-laravel-backend`). Adding a new mail requires updating this list.
- `MODULES_ROOT` is resolved relative to `__dirname` (`../../src/modules`), so the test must live two directories below the repo root.
