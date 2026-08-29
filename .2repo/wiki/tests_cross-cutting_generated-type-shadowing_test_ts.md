# tests/cross-cutting/generated-type-shadowing.test.ts

## Purpose

A cross-cutting guard that enforces a single-source-of-truth rule: any type shape whose name already exists in the Orval-generated `api/models` bundle must be imported from `@types` rather than redeclared as a handwritten `interface` or `type` in `src/`. It exists because duplicate names are invisible in code review, and the local copy silently wins at call sites, so drift goes undetected until the contract changes.

## Key elements

- **`STORAGE_SHAPES`** — allowlist of names permitted to be redeclared because the persisted (Mongoose) shape differs from the wire shape (e.g. `productId` is `ObjectId` vs `string`).
- **`TIER_BOUNDARY`** — allowlist of names that `infrastructure` must keep declaring locally because importing them would create an upward tier dependency.
- **`ALLOWED`** — union of the two lists above; used to exempt specific names from the shadowing check.
- **`filesUnder(root)`** — recursive walker that returns every `.ts` file under a directory.
- **`exportedNames(file, kinds)`** — regex-scans a file's source for `export interface|type|const <Name>` and returns the names.
- **`generatedNames`** — `Set` of all exported type names under `api/models/` (the Orval output).
- **`handwritten`** — flat array of `[name, relativePath]` pairs for every exported `interface` or `type` under `src/`, excluding `asyncapi.generated.ts`.
- **Three `it` blocks**:
  1. *Canary* — asserts `generatedNames` > 100 entries and contains `Order`, and `handwritten` > 50 entries, so the rule can't pass vacuously if the generated dir is renamed or emptied.
  2. *No shadowing* — fails if any handwritten name matches a generated name and is not in `ALLOWED`.
  3. *Stale allowances* — fails if an entry in `ALLOWED` no longer collides (no generated name *or* no handwritten declaration), preventing the allowlist from silently pre-approving future copies.

## Relationships

No dependency-graph neighbors are registered for this file. It depends only on `node:fs` and `node:path` at runtime and reads source text from `api/models/` and `src/` without importing them.

## Notes

- The scan reads generated **source text** rather than `import * as models` because TypeScript interfaces have no runtime value; a runtime import would see only the four enums and miss ~200 interface shapes.
- The regex is line-anchored (`^export …`) and multi-line (`m` flag); it will not catch non-exported local declarations or re-exports via `export { Foo } from …`.
- Extending `ALLOWED` is intentionally a reviewed decision: the default answer is to import from `@types`.
- `infrastructure/http/schemas.ts` follows the same "declare locally, don't import upward" convention referenced in the `TIER_BOUNDARY` comment.
- The canary test is the only thing preventing a silent no-op if `api/models` is moved or renamed — without it, every assertion would pass over an empty set.
