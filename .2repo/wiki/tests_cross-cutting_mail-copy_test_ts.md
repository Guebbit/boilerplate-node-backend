# tests/cross-cutting/mail-copy.test.ts

## Purpose

Statically cross-checks that every EJS mail template interpolates only variables its corresponding email builder actually supplies. It reads template files as text (no EJS render, no framework boot) and scans `src/modules/*/emails.ts` source for `template:` / `data:` pairs, then asserts every required variable has a matching key. It exists because the failure mode it guards is silent: a missing key means the template renders `<%= undefined %>` or throws at send time, not at review time.

## Key elements

- **`outputTags(source)`** — extracts every `<%= … %>` / `<%- … %>` tag body and its leading identifier.
- **`loopLocals(source)`** — collects variable names bound by `.forEach(function (x) { … })`, so they are excluded from the "required" set.
- **`includedPartials(source)`** — lists `include("…")` targets in order.
- **`requiredVariables(filePath, visited?)`** — recursively gathers all bare variables a template (and its includes) need; the `visited` set prevents infinite loops on circular includes.
- **`unsupportedTags(filePath)`** — flags any output tag whose body is not just a bare identifier (the "tripwire": if a template grows property access or method calls, this fails loudly instead of silently checking the wrong thing).
- **`templateFiles()`** — lists `.ejs` files under `shared/views/templates-emails/`.
- **`stripComments(source)`** — removes `/* … */` and `// …` comments before parsing builder source.
- **`topLevelEntries(body)`** — depth-aware split of an object-literal body on top-level commas (handles nested `{}`, `()`, `[]`).
- **`entryKey(entry)`** — extracts the property name (before `:`) or the whole shorthand identifier.
- **`extractBalanced(source, openIndex)`** — returns text between a consumed `{` and its matching `}`.
- **`builderDataKeys()`** — scans every `src/modules/*/emails.ts` for `template: 'name'` + `data: { … }` pairs, returning a `Map<templateName, key[]>`.
- **`describe` block (4 tests)** — canary (≥6 templates & builders exist); tripwire (no unsupported tags); orphan check (every template has a builder); coverage (every required variable is a key in the builder's data).

## Relationships

- **`scripts/build-contract-bundles.ts`** — listed as a graph neighbor (likely shares the `shared/views/templates-emails/` or `src/modules/*/emails.ts` inputs, or is co-run in the same test suite), but this file has no direct import or call into it. The interaction is purely through the shared file system paths both files read.

## Notes

- **No rendering.** The file never calls EJS's `render`; it regex-parses template text. This keeps the test in the no-framework layer (no SMTP, no queue, no i18n translator).
- **Bare-interpolation assumption is load-bearing.** The entire walk works only because templates use `<%= var %>`, not `<%= obj.prop %>` or `<%= helper(x) %>`. The "tripwire" test enforces this; if a template violates it, the test fails rather than silently under-checking.
- **Deliberate exclusion:** `shared/views/templates-files/orders.invoice.ejs` is the same EJS mechanism but renders a PDF via `orders/emails.ts`'s `invoiceDocument`; it is not an `EmailContent`, so it is intentionally outside this file's scope.
- **Canary test** (`≥ 6` templates, `≥ 6` builders) prevents a moved/renamed directory from turning every assertion into a pass-over-empty-set.
- **`stripComments` is a blind replaceAll**, safe only because none of the scanned data objects contain `//` or `/*` inside string literals. If that invariant breaks, the parser will mis-split.
- Mirrors the PHP `MailCopyTest` (Blade `__()` returns the missing key itself → mail sends with the key as visible text). The EJS analogue throws at render/send time; this file catches it at review time instead.
