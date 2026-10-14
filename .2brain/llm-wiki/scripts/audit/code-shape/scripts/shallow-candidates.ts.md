---
source: scripts/audit/code-shape/scripts/shallow-candidates.ts
sha256: 5e2d892dce5a8fedfd61c7895aead0fc143cfbcc7209cae801b139c57b86439e
generated_at: 2026-10-14T07:07:53.686798+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/code-shape/scripts/shallow-candidates.ts

## Purpose

Provides the counting logic for the `code-shape` audit: it walks a TypeScript program and produces per-function and per-file "facts" (body size, reference counts, forwarding bodies, unused optional parameters, import counts) that the audit then classifies into shallow-code smells. The file deliberately contains only counting; all verdicts live in `scripts/audit/code-shape/SKILL.md`. Resolution uses the TypeScript checker so import aliases, re-exports, and shorthand properties all resolve to the one named function.

## Key elements

- **`SMALL_BODY_LINES` (3), `FEW_USERS` (2), `FEW_EXPORTS` (2)** – exported thresholds that define "small," "rarely used," and "lazy file."
- **`FunctionFacts`** – interface describing one named function: location, body line count, reference count, files it is referenced from, optional `forwardsTo` callee, `optionalNeverPassed` parameter names, and `published` flag.
- **`FileFacts`** – interface for one file: export count, list of importing files, and `published` flag.
- **`ShallowReport`** – the four candidate lists (`smallAndRare`, `passThroughs`, `optionalNeverPassed`, `lazyFiles`) the audit consumes.
- **`targetOf`** – resolves an identifier through shorthand-property and import-alias indirection to the ultimate symbol.
- **`collectUsage`** – single pass over all project source files, recording reference count, referencing files, and per-call argument counts per symbol.
- **`namedFunctionOf`** – recognises both `function` declarations and variable-declared arrow/function expressions (skips overload signatures).
- **`soleCall` / `forwardTarget`** – detects whether a body is a single call (ignoring `await`/parens wrappers) whose arguments exactly mirror the function's own parameters in order.
- **`optionalNeverPassed`** – reports optional params beyond the maximum argument count observed across direct calls.
- **`moduleFileOf`** – resolves a module-specifier string literal to the project file it imports.
- **Regexes `BARREL`, `NEVER_A_CANDIDATE`, `LAID_OUT_FILE`** – pattern filters that exclude module-barrel re-exports, test/generated files, and structural layout files from candidacy.

## Relationships

- **`generate-shallow-candidates.ts`** – the entry-point script that builds a `ts.Program`, calls the counting helpers exported (or exposed) by this module, and writes the resulting `ShallowReport` to disk.
- **`shallow-candidates.test.ts`** – unit tests that exercise the counting helpers (forwarding detection, optional-param detection, usage collection) against small in-memory TS programs.

## Notes

- Lines are counted, not statements: a single 30-line promise chain still counts as one statement but exceeds `SMALL_BODY_LINES`.
- `callArguments` records `Infinity` for spread-argument calls; `optionalNeverPassed` is suppressed entirely when any reference is not a direct call (e.g. the function is passed as a callback).
- The `PLUMBING` set filters import/export specifier nodes so that `import { f } from …` / `export { f }` do not inflate the reference count.
- The file is truncated in the repo snapshot at `moduleFileOf`; the remaining logic (file-level import counting, barrel detection, report assembly) follows the same checker-based pattern.
