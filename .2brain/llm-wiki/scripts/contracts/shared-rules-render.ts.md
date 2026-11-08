---
source: scripts/contracts/shared-rules-render.ts
sha256: 4f908f5ceb86e03d5a3ebdae99c8405791f70e4455e8e70a0f8f4393560196f8
generated_at: 2026-11-08T02:45:06.005601+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/shared-rules-render.ts

## Purpose
Pure, filesystem-free renderer that turns a parsed shared-rules document plus a `GenerateSpec` into the text of a `.generated.ts` module. It is the "render" half of the code generator, kept separate so unit tests can call it without touching disk.

## Key elements
- **`deriveKey(value: string): string`** (exported) — Converts a dot-separated wire string to `UPPER_SNAKE_CASE` (e.g. `security.api_key.revoked` → `SECURITY_API_KEY_REVOKED`).
- **`renderGenerated(source, spec, document): string`** (exported) — The top-level entry point. Produces the full generated-file text: a header comment naming the YAML source path, followed by one `export const` declaration per entry in `spec.exports`.
- **`docblock`** (internal) — Formats a JSDoc comment; single-line form when the text fits on one line, multi-line `*`-prefixed block otherwise.
- **`sliceOf`** (internal) — Selects a top-level field from the parsed document (or returns the whole document when `field` is `undefined`). Throws if the field is absent.
- **`renderKeyed`** (internal) — Renders a `keyed-list` shape as an object-literal with a docblock per entry and `as const`. Throws on duplicate derived keys.
- **`withNumericSeparators`** (internal) — Inserts `_` into integer literals of ≥ 5 digits (satisfies `unicorn/numeric-separators-style`); string literals are left untouched.
- **`renderExport`** (internal) — Renders a single `export const` block, dispatching to `renderKeyed` or a plain `JSON.stringify` + `as const` depending on `spec.shape`.

## Relationships
- **`src/infrastructure/config/shared-rules/generate-spec.ts`** — Type source. This file imports `GeneratedExport`, `GenerateSpec`, and `KeyedEntry` from it.
- **`scripts/contracts/generate-shared-rule-schemas.ts`** — Sibling generator in the same contracts directory; together they form the two halves of the shared-rules codegen pipeline (schemas vs. TS render).
- **`tests/unit/scripts/contracts/shared-rules-render.test.ts`** — Unit-test suite that exercises `deriveKey` and `renderGenerated` against fixtures without filesystem access.
- **`src/infrastructure/adapters/antibot-providers/altcha.ts`** (and its test, **`tests/support/altcha.ts`**) — Downstream consumer: the `.generated.ts` this script emits is the module those files import from at runtime.

## Notes
- The file is intentionally **pure** (no `fs`, no `process`). All I/O belongs to the caller that feeds it the parsed document.
- `withNumericSeparators` operates on the JSON string *after* serialisation, so it only affects integer literals — booleans, strings, and nested keys are safe.
- The generated header names the YAML source path so a reader can trace back to the source of truth; the file itself is marked "do not edit."
- `renderKeyed` enforces key uniqueness at render time; the schema check upstream is expected to catch most duplicates, but this is a second guard.
