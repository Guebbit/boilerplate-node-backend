---
source: scripts/audit/code-shape/scripts/shallow-candidates.ts
source_sha256: 53542178a2033f540b2ff057fdd8b0b9d2e9405d2453424fe0dd91551202363a
context_sha256: 8bbfbbcae1fad1ff1548827edbb468e3c55d68be15b98aaadbe63d9548e12a32
generated_at: 2026-11-22T01:51:53.774479+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/audit/code-shape/scripts/shallow-candidates.ts

## Purpose
Computes the raw facts the `code-shape` audit uses to judge shallow code: small functions with one or two users, pure forwarders, optional parameters no caller passes, and files with one or two importers. It only counts; every verdict belongs to the audit. It uses the TypeScript checker rather than text search, so import aliases, re-exports, `obj.fn` reads off `{ fn }` objects, and destructured names resolve to the single function they name. Self-calls are not uses.

## Key elements
- **Thresholds**: `SMALL_BODY_LINES = 3`, `FEW_USERS = 2`, `FEW_EXPORTS = 2`.
- **Path patterns**:
  - `BARREL` matches module barrels (`src/modules/<m>/index.ts`).
  - `NEVER_A_CANDIDATE` matches module tests, `*.generated.ts` and `api/`. These are still counted as users.
  - `LAID_OUT_FILE` matches files the module layout requires (role files and controllers), which are never lazy.
- **`FunctionFacts`**: per-function record with file, line, name, `bodyLines`, `references`, `referencedFrom`, optional `forwardsTo`, `optionalNeverPassed`, and `published`.
- **`FileFacts`**: per-file record with `exports`, `importedBy`, and `published`. `published` means re-exported whole by a module barrel.
- **`ShallowReport`**: the output, with four lists: `smallAndRare`, `passThroughs`, `optionalNeverPassed`, `lazyFiles`.
- **`Usage`** (internal): references, distinct files, and argument count per direct call (`Infinity` for a spread).
- **`NamedFunction`** (internal): a function declaration, or a variable holding an arrow or function expression.
- **`PLUMBING`**: the syntax kinds for import and export specifiers, which are not uses.
- **`targetOf`**: resolves an identifier through import aliases, shorthand properties and `obj.fn` slots.
- **`slotValueOf`** and **`followProperty`**: map an object-literal property (`{ fn }` or `{ x: fn }`) back to the function it holds.
- **`destructuredTargetOf`**: resolves `const { fn } = svc` and `({ fn }) =>` on an `import()` result.
- **`callArgumentsOf`**: returns the argument count of the call an identifier is the callee of, including `svc.fn(x)`.
- **`projectFiles`**: the program's own source files, excluding declaration files and external libraries.
- **`namedFunctionOf`**: extracts a bodied function from a node. Overload signatures are ignored.
- **`isBoundToLocal`**: true when an object literal initialises an untyped, unexported local variable. The code relies on an `isExported` helper that is not shown in the visible part of the file.
- The doc comment of a further helper, which decides when an identifier in a `{ fn }` slot is plumbing rather than a use, is cut off in the visible part of the file.

## Relationships
- `generate-shallow-candidates.ts` is the neighbor script in the same directory. Its name suggests it drives this module to produce the candidate lists, but that is not shown in the visible content.
- `tests/unit/scripts/audit/shallow-candidates.test.ts` is the unit test for this module.
- `scripts/scaffold/scenario-registry.ts` is listed as a graph neighbor, but the visible content shows no interaction with it.

## Notes
- Known limit: `obj.fn` on an interface-typed object is not followed, so its `{ fn }` slot counts as a use instead.
- A `{ fn }` slot is plumbing only in an unexported, untyped local object. In a call argument, or in a returned, exported or interface-typed object, it counts as a use, because that is how handlers get registered.
- `optionalNeverPassed` is reported only when every use is a direct call.
- Line counts are used for size, not statements, because one statement can be a long promise chain.
- No library is used for reference finding: TypeScript's find-references and knip both miss `obj.fn`.
