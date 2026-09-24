---
source: tests/cross-cutting/mail-copy.test.ts
sha256: 046589107b9b747925905f235549b7ccb611a2c280ccc28d0c3ecfe087a91ba3
generated_at: 2026-09-23T19:56:43.265475+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/mail-copy.test.ts

## Purpose

Static cross-cutting test that verifies every EJS mail template under `shared/templates/emails/` only interpolates variables that its corresponding builder (in `src/modules/*/emails.ts`) actually supplies in the `data` object. It exists because both EJS (render-throw) and Blade's `__()` (returns the key itself) fail silently in practice — the mail sends, the user sees garbled copy, and the template author never notices. The check is purely text-based (regex scan of template source + depth-aware parse of builder source), so it runs with no booted framework, no SMTP, and no translator.

## Key elements

- **`outputTags(source)`** — extracts every `<%= … %>` / `<%- … %>` tag, returning the full body and the leading identifier (`head`).
- **`loopLocals(source)`** — collects variable names bound by `.forEach(function (x) { … })` so they are excluded from the "required" set.
- **`includedPartials(source)`** — returns relative paths from `include('…')` calls, enabling recursive walks.
- **`requiredVariables(filePath, visited?)`** — recursively collects all bare variables a template (and its includes) need; `visited` guards against cycles.
- **`unsupportedTags(filePath)`** — flags any tag whose body is not a single identifier (the tripwire that enforces the "bare interpolation only" contract).
- **`templateFiles()`** — lists `.ejs` files in `shared/templates/emails/`.
- **`builderDataKeys()`** — scans every `src/modules/*/emails.ts` for `template: '…'` declarations and extracts the top-level keys of the following `data: { … }` object.
- **`topLevelEntries(body)`** / **`entryKey(entry)`** / **`extractBalanced(source, openIndex)`** — depth-aware helpers that correctly split a `data` object literal into its top-level entries without breaking on nested braces, parens, or brackets.
- **`stripComments(source)`** — removes `/* … */` and `// …` before parsing builder source, preventing comment text from being misread as object keys.
- **`describe` block (4 tests)** — canary (≥ 6 templates & builders), bare-interpolation tripwire, orphan-template detection, and full variable-coverage check.

## Relationships

No direct imports or runtime interactions with the listed graph neighbors (`scripts/contracts/build-bundles.ts`, `scripts/docs/generate-role-matrix.ts`, `src/modules/account/tests/unit/two-factor.test.ts`) are present in this file. Its runtime data dependencies are the template files in `shared/templates/emails/` and the builder source in each module's `emails.ts`.

## Notes

- **Scope boundary:** `shared/templates/documents/orders.invoice.ejs` is deliberately excluded — it renders a PDF via a different shape (`invoiceDocument`) and is not an `EmailContent`. It would need its own pass.
- **Tripwire is a test, not a lint:** the "bare interpolation only" contract is enforced by a failing test, not a build-time check. If a template author introduces `<%= user.name %>` or a method call, the test fails loudly rather than silently checking the wrong variable name.
- **Canary test:** the first `it` asserts ≥ 6 templates and ≥ 6 builders exist, so a moved directory or renamed field cannot silently turn every assertion into a no-op pass.
- **Comment-stripping safety:** `stripComments` does a blind regex strip. This is safe only because none of the `data` objects in `emails.ts` contain a literal `//` or `/*` inside a string value. Adding one would break the parse.
- **Parallel to PHP's `MailCopyTest`:** same intent (builder supplies every template variable), same static approach, adapted from Blade's `__()` failure mode to EJS's render-time throw.
