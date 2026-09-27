---
source: tests/cross-cutting/mail-copy.test.ts
sha256: 5da10913750b1b9759119c0010d5eb5f36be80e9f47bec0d7fa37a5b4b8f83f5
generated_at: 2026-09-27T15:50:36.246032+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/mail-copy.test.ts

## Purpose

Statically cross-checks that every EJS email template under `shared/templates/emails/` receives a value for every variable it interpolates, by reading the template markup as text and the `EmailContent`-returning builders in each module's `emails.ts` as source. It exists to catch the silent failure mode where a template references a variable the builder never supplies — a mail that would render broken at send time with no earlier signal.

## Key elements

- **`outputTags(source)`** — extracts every `<%= … %>` / `<%- … %>` tag; returns its trimmed body and the leading identifier (`head`).
- **`loopLocals(source)`** — collects variable names bound by `.forEach(function (x) { … })` so they aren't mistaken for external data.
- **`includedPartials(source)`** — finds `include('…')` calls to recurse into partials.
- **`requiredVariables(filePath, visited)`** — recursively walks a template and its `include()`s, returning the set of bare variables it needs. `visited` guards against include cycles.
- **`unsupportedTags(filePath)`** — flags any tag whose body is not a single identifier (or an `include` call); used as the tripwire test.
- **`stripComments(source)` / `topLevelEntries(body)` / `entryKey(entry)`** — parse a builder's `data: { … }` object literal without executing it, splitting on top-level commas only.
- **`extractBalanced(source, openIndex)`** — returns the text between a `{` and its matching `}`.
- **`builderDataKeys()`** — scans every `<module>/emails.ts` under `MODULES_ROOT` for `template: '…'` + `data: { … }` pairs; returns `Map<templateName, dataKey[]>`.
- **`describe` block (4 tests)** — canary (non-empty scan), tripwire (bare-interpolation-only invariant), orphan detection (template with no matching builder), and the core missing-variable assertion.

## Relationships

- **`tests/support/paths.ts`** — imported as `@tests/paths`; supplies `REPO_ROOT` (to locate `shared/templates/emails/`) and `MODULES_ROOT` (to locate each module's `emails.ts`). No other graph neighbor is imported or referenced directly by this file.

## Notes

- **Static by design.** No framework, SMTP, queue, or translator is booted. Templates are read as text, builders as source. This keeps the test in the zero-dependency layer.
- **Bare-interpolation invariant.** The entire walk assumes templates only print a bare identifier or loop one array via `.forEach(function (x) {…})`. The tripwire test (`uses only bare interpolation…`) will fail loudly the moment a template introduces property access (`user.name`) or a method call — do not remove that test to "fix" a template that violates the rule.
- **Explicitly excluded:** `shared/templates/documents/orders.invoice.ejs`. It uses the same EJS mechanism but is not an `EmailContent`; widening this file to cover it would require a second data shape for one template.
- **Canary threshold (≥ 6).** Guards against a moved directory or renamed field silently producing an empty scan that passes all assertions vacuously.
- **`stripComments` is a blind replace.** Safe here because none of the builder data objects contain `//` or `/*` inside string literals. If that invariant changes, the strip must become context-aware.
