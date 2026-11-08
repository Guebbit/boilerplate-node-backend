---
source: scripts/docs/generate-role-matrix.ts
sha256: f54d8f4f65ad466ee0ebac450e61f19331707d615a6246bb2e96254604566684
generated_at: 2026-11-08T02:48:39.426975+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-role-matrix.ts

## Purpose

Generates and maintains role-permission matrix tables in the docs. For `docs/demo-ecommerce/index.md` it writes the full "effective role matrix" (which action codes each role/audience holds, per module), and for each module's page under `docs/modules/` it writes a per-rule "who can do what" table. The effective matrix is computed by asking the kernel's `heldRules` evaluator rather than re-expanding permission sets locally, because the result (set expansion, audience folding, implied actions, conditions) is too complex to derive by hand.

## Key elements

- **`personas`** — Ordered list of rows: audience names (`guest`, `unverified`, `customer`, …) followed by preset roles (excluding `system`). Each carries a `scope`, optional `role` name, and `audience`.
- **`modules`** — Unique module names from `PERMISSION_RULES`, in declaration order; these form the table columns.
- **`callerFor(persona)`** — Resolves a persona into a `Caller` via `keysInScope` + `assembleCaller`, using literal `'generated'` for identity/org (no real request context exists).
- **`cell(caller, module)`** — Produces one cell in the index matrix: one-letter action codes (`r`, `c`, `u`, `d`, `x`, `s`, `o`), **uppercase** when the rule is unconditional, lowercase when conditioned, `—` for nothing. Expands `IMPLIED_ACTIONS` (e.g. `display` → also `r`).
- **`effectiveTable()` / `body()`** — Assembles the full Markdown block (header row, separator, data rows, legend prose) for the index page.
- **`ruleCell(rule, caller)`** — One cell in a module page: `✅`, `✅ own` (condition pins to caller's rows), or `⚡c`/`⚡s` (step-up tier); `—` if not held.
- **`moduleBody(pageModules)`** — Builds the per-rule table for a module docs page, including the permission sets that bundle each rule and a credential-mintability column.
- **`pageOf(module)` / `modulesByPage()`** — Maps modules to their docs pages; `core` → `locales`, `example` → no page.
- **`pages`** — Flat list of every `{ file, blocks, label }` this script owns (index page first, then module pages).
- **`run()`** — Iterates all pages, calls `applyMarkerBlocks` on each, returns the worst exit code. Supports `--check` mode (report drift, don't write).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/permissions.ts` | Source of `PERMISSION_RULES`, `PERMISSION_SETS`, `PRESET_ROLES`, `AUDIENCE_NAMES`, `IMPLIED_ACTIONS`, `keysInScope`, `assembleCaller` — the entire permission model the matrix is built from. |
| `src/kernel/ability.ts` | Imports `heldRules`, the single authoritative "which rule IDs does this caller hold" function. The script never re-expands sets itself. |
| `scripts/docs/marker-block.ts` | Imports `applyMarkerBlocks` to write or check the `<!-- role-matrix:… -->` / `<!-- permissions:… -->` delimited blocks in each page. |
| `scripts/modules-on-disk.ts` | Imports `REPO_ROOT` as the base path for resolving doc file locations. |
| `scripts/cli.ts` | Imports `hasFlag` to detect `--check`. |
| `scripts/fail-script.ts` | Imported as the `catch` handler on the top-level `run()` promise. |

## Notes

- **`system` is excluded** from `personas` deliberately: it is an alias for `admin`'s permission list in `authorization-roles.yaml` and is never a role an operator assigns, so including it would duplicate `admin`'s row.
- **`callerFor` uses `'generated'`** for identity and org IDs because the script has no `AuthContext`. The comment notes this is safe because `permissions` (the only field the evaluator consults for rule matching) is derived solely from `keysInScope`.
- **`core` maps to `locales`** and **`example` has no page** — both are special-cased in `pageOf`.
- **One-letter codes** keep the wide matrix table legible; the legend in `body()` documents the mapping and the uppercase/lowercase convention.
- The script follows the same marker-block pattern as `generate-module-graph.ts`: prose outside the markers is never touched; only the content between `START`/`END` is regenerated.
