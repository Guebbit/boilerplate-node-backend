---
source: scripts/docs/generate-role-matrix.ts
sha256: 4fcf1deed8299a4b5bcbc404d5c3b2f9b4b4f130c2befaf0befcbf243a2a7eb3
generated_at: 2026-09-23T17:26:00.961047+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-role-matrix.ts

## Purpose

Regenerates the effective role-permission matrix table embedded in `docs/demo-ecommerce/index.md` between HTML-comment markers. The table shows, for every preset role, exactly which permission keys it holds per module — an answer that cannot be reliably derived by eye because of the `guest`-baseline floor and `any`-breadth keys. Runs in two modes: write (default) and `--check` (CI, reports drift without rewriting).

## Key elements

- **`apply()`** — Entry point. Reads the target page, locates the `<!-- role-matrix:start -->` / `<!-- role-matrix:end -->` markers, splices in the regenerated block, formats the whole page with Prettier, and either writes the file or reports drift (exit 1) when `--check` is set.
- **`body()`** — Assembles the full replacement block: a short prose lead-in, the table, a legend explaining the letter codes and case, and a closing note about `operator`/`admin` scoping.
- **`effectiveTable()`** — Builds the Markdown table. Rows = `ANONYMOUS_ROLE` then `PRESET_ROLES` (declaration order). Columns = unique modules extracted from `PERMISSION_KEYS`.
- **`cell(caller, module)`** — Renders one cell. Calls `heldKeys(caller)` to get the set of keys, filters to the module, then emits one letter per distinct action: **uppercase** if the role holds the `any`-breadth key for that action, lowercase for `self`, em-dash if nothing.
- **`callerFor(name, scope)`** — Constructs a `Caller` object for the evaluator without an `AuthContext`. Unions `permissionsOfRole` with `ANONYMOUS_ROLE.permissions` for tenant-scope roles; sets `tenantId` to `'generated'` (or `null` for platform).
- **`codes`** — One-letter mapping for actions (`r`, `c`, `u`, `d`, `x`, `s`, `o`) so the table stays narrow.
- **`breadthOf(key)`** — Returns the segment before the action (e.g. `any` or `self`) from a dot-separated key.
- **`roles`** / **`modules`** — Precomputed row and column sets.

## Relationships

- **`src/kernel/permissions.ts`** — Source of `ANONYMOUS_ROLE`, `PERMISSION_KEYS`, `PRESET_ROLES`, `permissionsOfRole`, and `isUnrestricted`. The script reads the key catalogue and role definitions from here; it never re-expands grants on its own.
- **`src/kernel/ability.ts`** — Provides `heldKeys(caller)`, the single authoritative answer to "which keys does this caller hold." The script deliberately uses this (rather than `holdsKey`) so the docs share the same expansion logic as route guards.
- **`src/types/index.ts`** — Supplies the `AuthorizationScope` and `Caller` types used to shape the synthetic callers.

## Notes

- `guest` (`ANONYMOUS_ROLE`) is always the first row even though no one logs in as it; it is the baseline floor that the kernel unions into every tenant caller, so the table shows that floor explicitly.
- The script does **not** go through `callerInScope` because it has no `AuthContext`/request; it builds the `Caller` manually. The comment notes the two agree on `permissions` because both read `permissionsOfRole`.
- Prettier is run over the **entire page** (not just the inserted block) before comparing/writing, so the file is always format-stable for a subsequent `prettier --check`.
- `operator` is platform-scoped and reads no tenant rows, so its row is blank in every shop column — a fact the closing prose calls out.
- The `--check` flag is consumed from `process.argv` at module top-level; the script is a CLI entry (`void apply()`) and is invoked via `npm run docs:roles`.
