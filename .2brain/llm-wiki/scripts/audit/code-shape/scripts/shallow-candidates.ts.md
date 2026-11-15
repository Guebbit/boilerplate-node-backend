---
source: scripts/audit/code-shape/scripts/shallow-candidates.ts
sha256: 77eae69bc4dc14a4baaa520b783be3a1dbe806e2bcab9e13fa5b8324f893eb63
generated_at: 2026-11-14T17:20:53.579738+00:00
model: ollama:qwen3.8:27b
---

# scripts/audit/code-shape/scripts/shallow-candidates.ts

## Purpose

Counts structural facts about functions and files that the `code-shape` audit uses to flag shallow code: small bodies with few callers, pure forwarders, optional parameters no caller supplies, and files with few importers. It performs counting only — all verdicts live in the audit skill (`SKILL.md`). Resolution is built on the TypeScript checker API rather than text search, so import aliases, re-exports, shorthand properties (`{ fn }`), and destructured bindings all resolve to the single function they name.

## Key elements

- **`FunctionFacts`** (exported interface) — one named function plus its usage: file, line, `bodyLines`, `references`, `referencedFrom`, optional `forwardsTo`, `optionalNeverPassed`, and `published` flag.
- **`FileFacts`** (exported interface) — one file plus its export count, `importedBy` list, and `published` flag.
- **`ShallowReport`** (exported interface) — the four candidate lists the audit hands to its agent: `smallAndRare`, `passThroughs`, `optionalNeverPassed`, `lazyFiles`.
- **Thresholds** — `SMALL_BODY_LINES = 3`, `FEW_USERS = 2`, `FEW_EXPORTS = 2`.
- **Regexes** — `BARREL` (module barrel files), `NEVER_A_CANDIDATE` (tests, generated, `api/`), `LAID_OUT_FILE` (structurally required module files).
- **`targetOf`** — resolves an identifier through alias symbols, shorthand property assignments, and `{ fn }` / `{ x: fn }` property reads to the ultimate declaration.
- **`destructuredTargetOf`** — resolves a name bound by object destructuring (`const { fn } = svc`) to the underlying property symbol.
- **`callArgumentsOf`** — returns the argument count of the call an identifier is the callee of (`Infinity` for spread).
- **`isObjectSlot`** / **`isBoundToLocal`** — classify a `{ fn }` occurrence as plumbing (not a use) when the object is an unexported, untyped local variable; treat it as a real use in call arguments, returns, or exported/interface-typed objects.
- **`namedFunctionOf`** — extracts `name`, `body`, `parameters` from a `FunctionDeclaration` or a `VariableDeclaration` holding an arrow/function expression.
- **`PLUMBING`** (set of `SyntaxKind`) — identifiers in `ImportSpecifier`, `ExportSpecifier`, `ImportClause`, `NamespaceImport`, `ImportEqualsDeclaration` positions are never counted as uses.

## Relationships

- **`generate-shallow-candidates.ts`** — the sibling script that imports this module and invokes its counting logic to produce the `ShallowReport` JSON output for the audit agent.
- **`tests/unit/scripts/audit/shallow-candidates.test.ts`** — unit tests exercising the resolution helpers (`targetOf`, `destructuredTargetOf`, `callArgumentsOf`, `isObjectSlot`) and the report shape against synthetic TypeScript sources.

## Notes

- **Known limit:** `obj.fn` on an interface-typed object is *not* followed; the `{ fn }` slot on the object's literal declaration is counted instead. Neither `find-references` nor `knip` handle this case, which is why the checker API is used.
- **Self-calls excluded:** a function calling itself does not increment its own `references` count.
- **Plumbing vs. use:** `{ fn }` is context-sensitive. Inside an unexported, untyped local object it is plumbing (not a use); in a call argument, a return value, or an exported/interface-typed object it *is* a use (handler registration).
- The file imports only `node:path` and `typescript` — no project-internal dependencies beyond the graph neighbors listed above.
