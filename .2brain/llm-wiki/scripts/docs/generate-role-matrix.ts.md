---
source: scripts/docs/generate-role-matrix.ts
sha256: aa837a9903687c178074dbfde2d0dd9a815e9c5d23222193b49798ef125140ba
generated_at: 2026-10-15T09:41:01.326233+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-role-matrix.ts

## Purpose

Generates the **effective role matrix** table in `docs/demo-ecommerce/index.md` — a per-role, per-module view of exactly which permission keys each role holds after the evaluator resolves them. The answer cannot be written by hand (anonymous-baseline union, `any` vs `self` breadth, unrestricted expansion), so the script derives it from `heldKeys` and writes the result between HTML-comment markers, leaving surrounding prose untouched.

## Key elements

- **`callerFor(name, scope)`** – Builds the `Caller` object the evaluator would produce for a role, applying the anonymous-baseline union for non-anonymous scopes. Returns a `Caller` with a synthetic `id`/`tenantId` (`'generated'`) and `system: false` always.
- **`cell(caller, module)`** – Renders one table cell: one-letter action codes (`r c u d x s o`), **UPPERCASE** when the caller holds the `any`-breadth key for that action, lowercase for `self`, em-dash (—) when nothing is held.
- **`effectiveTable()`** – Assembles the full Markdown table (header + separator + one row per role, one column per module).
- **`body()`** – The complete block content: intro sentence, the table, a legend line, and a closing interpretive paragraph. This is what replaces everything between the markers.
- **`roles`** – `ANONYMOUS_ROLE` first, then `PRESET_ROLES` minus `system`. `guest` is kept as the comparison baseline; `system` is excluded because it duplicates `admin`'s keys and is never operator-assigned.
- **`modules`** – Unique module names from `PERMISSION_KEYS` in declaration order; these become the table columns.
- **`codes`** – Maps long action names to single letters so the table stays narrow.
- **`breadthOf(key)`** – Extracts the second-to-last dot-segment of a key string (e.g. `"any"` from `orders.any.read`).
- **`checkOnly`** – Set when `--check` is in `process.argv`; passed through to `applyMarkerBlocks` so `complete` reports drift instead of rewriting.
- **`applyMarkerBlocks`** (from `./marker-block`) – Performs the marker-block write/check; the script exits with its return code.

## Relationships

- **`src/kernel/permissions.ts`** – Source of `ANONYMOUS_ROLE`, `PERMISSION_KEYS`, `PRESET_ROLES`, `permissionsOfRole`, `isUnrestricted`, `levelOfRole`. The script queries these to build callers and enumerate the module columns.
- **`src/kernel/ability.ts`** – Provides `heldKeys`, the single function that answers "which keys does this caller hold." The script deliberately uses `heldKeys` (full key set) rather than `holdsKey` (binary) to enumerate exact keys.
- **`scripts/docs/marker-block.ts`** – `applyMarkerBlocks` handles the locate-replace-or-check logic between `<!-- role-matrix:start -->` and `<!-- role-matrix:end -->`.
- **`scripts/modules-on-disk.ts`** – Supplies `REPO_ROOT` so the script resolves `docs/demo-ecommerce/index.md` relative to the repo root regardless of CWD.
- **`src/types/index.ts`** – Type-only import of `AuthorizationScope` and `Caller`.

## Notes

- The script manages **exactly one table** between the markers. All surrounding prose (role descriptions, narrative) is hand-written and must not be regenerated here.
- `tenantId` is the literal string `'generated'` — a placeholder that satisfies the `Caller` type; it has no runtime meaning.
- The anonymous baseline union (`permissionsOfRole(name) ∪ ANONYMOUS_ROLE.permissions`) is applied **inside** `callerFor` for every non-anonymous scope, mirroring what the kernel does at request time. Omitting it would make every row look more permissive than it actually is.
- `--check` is the mode `npm run complete` invokes; it exits non-zero on drift without touching the file. The re-run hint surfaced to the operator is `docs:roles`.
- The `system` role is intentionally absent from the table. It is an internal alias for `admin`'s key list and is never a role an operator assigns to a user.
