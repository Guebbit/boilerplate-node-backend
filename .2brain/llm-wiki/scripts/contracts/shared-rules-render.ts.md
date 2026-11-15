---
source: scripts/contracts/shared-rules-render.ts
sha256: 57eb055c7d3800db79121c6bec0dfc33d96659afeeaf2d0e25877968c3797762
generated_at: 2026-11-14T17:29:41.706858+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/shared-rules-render.ts

## Purpose

Pure rendering half of the shared-rules code generator. Given a parsed rules document and a `GenerateSpec`, it produces the full text of a `.generated.ts` module. No filesystem access, so unit tests can exercise it in isolation.

## Key elements

- **`deriveKey`** (exported) – Converts a dot-delimited wire string to an uppercase constant key with `.` replaced by `_` (`security.api_key.revoked` → `SECURITY_API_KEY_REVOKED`).
- **`renderGenerated`** (exported) – Top-level entry point. Assembles the module header ("do not edit" banner naming the YAML source) followed by every export in the spec.
- **`renderExport`** (internal) – Renders a single export. Dispatches on `spec.shape`: `keyed-list` goes through `renderKeyed`; everything else is a pretty-printed JSON literal with `as const`.
- **`renderKeyed`** (internal) – Emits an object literal with one JSDoc line per entry. Throws if two entries would derive the same key.
- **`sliceOf`** (internal) – Extracts the `spec.field` slice from the parsed document. Throws a descriptive error when the field is absent.
- **`withNumericSeparators`** (internal) – Inserts `_` every three digits in bare integers ≥ 5 digits (satisfies `unicorn/numeric-separators-style`). String literals are left untouched.
- **`docblock`** (internal) – Formats one or more lines of text as a `/** … */` comment at the given indent.

## Relationships

- **`src/infrastructure/config/shared-rules/generate-spec.ts`** – Provides the `GenerateSpec`, `GeneratedExport`, and `KeyedEntry` types that this module imports and renders against.
- **`tests/unit/scripts/contracts/shared-rules-render.test.ts`** – Direct unit test; exercises `renderGenerated` and `deriveKey` with in-memory documents (no file I/O).
- **`src/infrastructure/adapters/antibot-providers/altcha.ts`** and its tests – Runtime consumers of the constants this renderer emits; the generated file's exports are imported at the call site.
- **`scripts/scaffold/plan.ts`** – Part of the same generation pipeline; orchestrates when `renderGenerated` is invoked during `npm run regenerate`.

## Notes

- The rendered module is **never hand-edited**; the header comment enforces this convention. Edit the source YAML and re-run the generator.
- `renderKeyed` performs a duplicate-key check *at render time*, not at schema-validation time. A malformed YAML that passes schema validation can still crash the generator if two values map to the same derived key.
- `withNumericSeparators` is applied **only** to the plain-literal path, not to `keyed-list` output (where values are already `JSON.stringify`-ed inline).
- The module is intentionally side-effect-free: it returns a string and touches no `fs`, making it trivially testable and safe to import in any context.
