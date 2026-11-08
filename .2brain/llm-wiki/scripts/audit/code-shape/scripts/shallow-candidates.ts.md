---
source: scripts/audit/code-shape/scripts/shallow-candidates.ts
sha256: 8fd31ff76d16bf44453bacdc153a15121c4f326035e7e846ebe00e9326346db7
generated_at: 2026-11-08T02:37:27.647939+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/code-shape/scripts/shallow-candidates.ts

## Purpose

Counts structural facts that the `code-shape` audit uses to judge shallow code: small bodies with few users, pure forwarders, optional parameters no caller passes, and files with few exports/importers. It performs counting only — every verdict belongs to the audit agent. Built on the TypeScript type-checker (not text search) so import aliases, re-exports, and shorthand properties resolve to the single function they name.

## Key elements

- **`FunctionFacts`** (exported interface) — per-function record: file, line, name, body line count, reference count, referencing files, optional `forwardsTo` callee, `optionalNeverPassed` parameter names, and `published` flag.
- **`FileFacts`** (exported interface) — per-file record: exported name count, list of importing files, and `published` flag.
- **`ShallowReport`** (exported interface) — the four candidate lists handed to the audit agent: `smallAndRare`, `passThroughs`, `optionalNeverPassed`, `lazyFiles`.
- **`Usage`** (internal interface) — per-symbol usage: reference count, set of files, and per-call argument counts (`Infinity` for spread).
- **`NamedFunction`** (internal interface) — extracted name, body, and parameters for a function declaration or arrow/function-expression variable.
- **`targetOf`** — resolves an identifier through shorthand-property assignments and alias symbols to the ultimate declaration symbol.
- **`collectUsage`** — walks every project file once, recording each non-plumbing identifier use against its resolved symbol.
- **`namedFunctionOf`** — extracts a `NamedFunction` from a function declaration or a variable holding an arrow/function expression.
- **`soleCall`** / **`forwardTarget`** — detect whether a body is a single call (optionally wrapped in `await`/parens) and whether the arguments match the function's own parameters in order.
- **`optionalNeverPassed`** — flags optional parameters at or past the max argument count any direct call supplies.
- **`moduleFileOf`** — resolves a module specifier string to the in-program source file it refers to.
- **`PLUMBING`** — set of `SyntaxKind` values (import/export specifiers, etc.) excluded from use counts.
- **`SMALL_BODY_LINES` (3), `FEW_USERS` (2), `FEW_EXPORTS` (2)** — thresholds for "small," "rarely used," and "few exports."
- **`BARREL`, `NEVER_A_CANDIDATE`, `LAID_OUT_FILE`** — regex patterns identifying module barrels, excluded files (tests, generated, `api/`), and structurally required module files.

## Relationships

- **`scripts/audit/code-shape/scripts/generate-shallow-candidates.ts`** — the entry-point script that builds the `ts.Program`, invokes the functions in this module, and emits a `ShallowReport`.
- **`tests/unit/scripts/audit/shallow-candidates.test.ts`** — unit tests exercising `collectUsage`, `forwardTarget`, `optionalNeverPassed`, and related helpers.
- **`scripts/scaffold/scenario-registry.ts`** — provides the repo-relative path mapping (`relativeOf`) and project layout context used when constructing the audit program.

## Notes

- The file is a `@module` (no default export); consumers import named interfaces and (presumably) a top-level counting function defined below the truncated section.
- `optionalNeverPassed` returns an empty array when not every reference is a direct call — spread (`Infinity`) or callback usage disqualifies the check.
- `forwardTarget` treats `...rest` on both sides as valid forwarding; non-identifier parameters or arguments break the match.
- `collectUsage` excludes the declaration's own name node via `ts.getNameOfDeclaration`, so a function never counts as its own user.
- The file does not itself decide whether a candidate is a problem; the audit agent (see `SKILL.md`) interprets the counts.
