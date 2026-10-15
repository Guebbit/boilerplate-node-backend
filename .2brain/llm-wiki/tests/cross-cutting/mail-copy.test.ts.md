---
source: tests/cross-cutting/mail-copy.test.ts
sha256: 85c5c1080328f3584af3eb07c16d1a1e4ecac6f261a7c8c9a482ceab4eab78c0
generated_at: 2026-10-15T12:38:25.794970+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/mail-copy.test.ts

## Purpose

Cross-cutting static test that guarantees every variable an EJS mail template interpolates is actually supplied by the builder that renders it. It reads templates as plain text and builders as source (no booted framework, no SMTP, no translator), checking the full variable contract between `src/modules/<name>/templates/*.ejs` and the `EmailContent`-returning builders in each module's `emails.ts`. It exists because a missing key in EJS throws only at render/send time, not at review time — silently shipping a broken mail.

## Key elements

- **`templateDirectories()` / `templateFiles()`** — Enumerates `MODULES_ROOT/<module>/templates/*.ejs`. Non-recursive by design; PDFs one level deeper (`invoicing/templates/documents/`) are excluded.
- **`outputTags()`** — Regex-extracts every `<%= … %>` / `<%- … %>` tag, returning the full body and the leading identifier (`head`).
- **`loopLocals()`** — Collects variable names bound by `.forEach(function (x) { … })` so they are excluded from the required-variable set.
- **`includedPartials()` / `resolveIncludePath()`** — Finds `include(…)` calls and resolves their paths the same way EJS does (leading `/` → `REPO_ROOT`, otherwise relative to the including file).
- **`requiredVariables(filePath, visited)`** — Recursively walks a template and its `include()`s to collect all bare variables it needs. `visited` guards against cycles.
- **`unsupportedTags()`** — Flags any tag whose body is not a single bare identifier (e.g. `user.name`, `x.toUpperCase()`). The "tripwire" test asserts this list is empty.
- **`stripComments()`** — Removes `/* … */` and `// …` before parsing builder source; safe because none of these data objects embed those sequences in strings.
- **`topLevelEntries()`** — Depth-aware split of an object-literal body into top-level `key: value` entries (tracks `{([` / `)}]` nesting so a comma inside a nested call like `t('…', { a, b })` does not split incorrectly).
- **`entryKey()` / `extractBalanced()`** — Helpers that pull the key name from an entry and extract the text between a known opening `{` and its matching `}`.
- **`FRAME_KEYS`** — `['locale', 'pageMetaTitle', 'greeting', 'footer']`; keys the `accountMail` frame supplies automatically, so a builder's `body: (t) => ({…})` is checked against these plus its own entries.
- **`builderDataKeys()`** — Scans each module's `emails.ts` for `template: '<name>'` patterns, detects whether the builder uses the `body: (t) => ({…})` frame or a flat `data: {…}`, and returns a `Map<templateName, key[]>`.
- **Test suite** — Four `it` blocks: a canary (≥ 6 templates and ≥ 6 builders exist), the bare-interpolation tripwire, orphan detection (every template has a matching builder), and the variable-coverage check (every required variable appears in the builder's key list).

## Relationships

- **`tests/support/paths.ts`** — Imports `REPO_ROOT` and `MODULES_ROOT` to anchor all filesystem walks. Every path in this file is derived from those two constants.

## Notes

- **Tripwire is intentional.** The "uses only bare interpolation" test is a deliberate guard: the moment a template introduces property access or a method call, the test fails loudly rather than silently checking the wrong identifier. If the template language evolves, the walk logic must be extended in the same PR.
- **`invoicing` PDFs are out of scope on purpose.** `invoicing.document.ejs` and `invoicing.document.vat-table.ejs` live under `invoicing/templates/documents/` (one level deeper), are not `EmailContent`, and are rendered via `buildDocumentView` — not through a mail builder. They need their own coverage pass.
- **The canary assertion is load-bearing.** Without the "≥ 6 templates, ≥ 6 builders" check, a directory rename or a refactor that removes the `template:` field would cause every subsequent assertion to pass over an empty set.
- **`topLevelEntries` is the reason this file can read builder source as text.** A naive comma-split would break on nested object/function-call arguments — the exact class of silent-wrong-coverage bug this file is trying to prevent in templates.
- **`visited` in `requiredVariables` is a defensive guard, not an expected path.** Nothing in the codebase is expected to cycle, but the cost of a `RangeError` stack-overflow in CI is worse than the cost of an early return.
