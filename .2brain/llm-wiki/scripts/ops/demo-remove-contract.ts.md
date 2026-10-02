---
source: scripts/ops/demo-remove-contract.ts
sha256: f9e3293ea05572eb3abf738eeccf495125b4358ea893c7432143beba3e690ecd
generated_at: 2026-10-01T12:34:38.082717+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/demo-remove-contract.ts

## Purpose

Step 2 of 3 in the G-D2 demo-module removal flow. Edits `shared/contracts/openapi.root.yaml` to strip the seven shop-module fields (`orders`, `payments`, `shipments`, `cart`, `wishlist`, `invoicing`, `returns`) from `AccountExportResponse`, since `account`'s own fragment cannot name a sibling module's schema. This is a contract change: the caller must still run `npm run regenerate` afterward.

## Key elements

- **`stripAccountExportSchema(repoRoot: string): RemovalNote`** — The sole export. Reads the root OpenAPI YAML, performs six exact-match string replacements (one for the `required` array, one per schema field to delete), writes the file back, and returns a `RemovalNote` describing what was dropped.
- **`mustReplace` (local helper)** — Wraps `String.prototype.replace` with a guard: throws if the search string is not found. Uses a function replacer so `$&` / `$1` in the replacement text are not interpreted as substitution patterns.

## Relationships

- **`scripts/ops/demo-remove-registry.ts`** — Supplies the `RemovalNote` type used as the return type of `stripAccountExportSchema`.
- **`scripts/ops/demo-remove.ts`** — The orchestrating caller. Invokes this function to programmatically edit the export schema rather than leaving it to a human who would discover the issue via a `no-unresolved-refs` failure.

## Notes

- **Fragile string matching.** Each replacement targets a hard-coded multi-line block with exact indentation. If the YAML formatting of `AccountExportResponse` changes (reordering, reformatting, added fields), the replacements will throw. This is intentional — a mismatch means the file no longer matches the expected shape and manual review is safer than a silent partial edit.
- **Path index is not edited here.** The file's path index is maintained by the OpenAPI bundler from on-disk fragments; only the `AccountExportResponse` schema is modified.
- **Contract change, not just a cleanup.** Per the project's CLAUDE.md workflow, any edit to this file is a contract change requiring `npm run regenerate`.
- The `account` module's runtime export service (`src/modules/account/services/personal-data-registry.ts`) already handles absent sections by reading `enabledModules`, so removing the fields from the schema is sufficient — no runtime code change is needed in `account`.
