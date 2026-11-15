---
source: scripts/docs/generate-role-matrix.ts
sha256: d4f886cfcd4fbbd9d3e34ec2a12675467afd2c1df9e7cd13d45e377d4a5aa38a
generated_at: 2026-11-14T17:33:43.210148+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-role-matrix.ts

## Purpose

Generates and maintains the **effective role matrix** tables in documentation: one role × module summary table on `docs/demo-ecommerce/index.md` and one "who can do what" per-rule table on each module's docs page. All tables live inside HTML-comment markers so surrounding prose stays hand-written. In `--check` mode it reports drift without rewriting (used by `complete`). The matrix is produced by asking the real evaluator (`heldRules`) rather than re-expanding permission sets, keeping a single source of truth for "what may this role do."

## Key elements

- **`personas`** – The rows: every `AUDIENCE_NAMES` entry (guest, unverified, verified, etc.) plus every `PRESET_ROLES` entry except `system`, each resolved with the `customer` audience.
- **`modules`** – Deduplicated module names extracted from `PERMISSION_RULES`; these become the column headers.
- **`callerFor(persona)`** – Builds a `Caller` via `keysInScope` + `assembleCaller`, mimicking what the runtime evaluator would see for that persona.
- **`cell(caller, module)`** – Produces one compact cell: one-letter action codes (`r c u d x s o`), **UPPERCASE** when the rule is unconditional, lowercase when a condition narrows it, em-dash when nothing is held. Also folds in `IMPLIED_ACTIONS`.
- **`effectiveTable()` / `body()`** – Assemble the full index-page block (table + legend + reading guidance) that replaces the content between `<!-- role-matrix:start -->` and `<!-- role-matrix:end -->`.
- **`ruleCell(rule, caller)`** – Per-rule cell for module pages: ✅ / ✅ own / ⚡c / ⚡s / —, reflecting held status, caller-scoped conditions, and step-up tier.
- **`moduleBody(pageModules)`** – Builds the per-module table (rule × persona grid with set membership, credential flag, and description).
- **`pageOf(module)` / `modulesByPage()`** – Maps module names to their docs page (`core` → `locales`, `example` → no page); groups modules by page.
- **`pages`** – The list of all target files and their marker blocks the script owns.
- **`run()`** – Iterates every page, calls `applyMarkerBlocks`, and returns the worst exit code across pages.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/permissions.ts` | Source of truth: imports `AUDIENCE_NAMES`, `IMPLIED_ACTIONS`, `PERMISSION_RULES`, `PERMISSION_SETS`, `PRESET_ROLES`, `assembleCaller`, `keysInScope`, and the `AudienceName` type. |
| `src/kernel/ability.ts` | Imports `heldRules` — the single evaluator the script asks "can this caller do this rule?" for every cell. |
| `scripts/docs/marker-block.ts` | Imports `applyMarkerBlocks` to write or check the content between start/end markers on each page. |
| `scripts/cli.ts` | Imports `hasFlag` to detect `--check`. |
| `scripts/fail-script.ts` | Imports `failScript` as the top-level error handler. |
| `scripts/modules-on-disk.ts` | Imports `REPO_ROOT` for resolving doc file paths. |

## Notes

- **`system` is excluded** from `personas` by design: it is `admin`'s permission list under an alias (see `authorization-roles.yaml`), never a role an operator assigns, and its row would duplicate `admin`'s exactly.
- **`guest` and `unverified` are included** even though nobody "holds" them as roles; they serve as the baseline every other row is compared against.
- **Staff rows are always evaluated with the `customer` audience** — a signed-in caller is a customer first (`keysInScope` enforces this); the script mirrors that by hard-coding `audience: 'customer'` for preset roles.
- **`core` maps to the `locales` page; `example` has no page.** `pageOf` encodes this one-off mapping.
- **One table per page.** The generated block is self-contained; all surrounding prose is hand-written and must not be regenerated.
- **Uppercase vs. lowercase in the effective table** is the primary readability signal: uppercase = the rule applies to every row; lowercase = narrowed to the caller's own or published rows.
- **The script never re-expands `PERMISSION_SETS`** for the effective table; it asks `heldRules` (which already resolves sets → rules). Sets are only listed as text in the module-level tables for context.
