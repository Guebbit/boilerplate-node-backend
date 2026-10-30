---
source: scripts/docs/generate-role-matrix.ts
sha256: f54d8f4f65ad466ee0ebac450e61f19331707d615a6246bb2e96254604566684
generated_at: 2026-10-29T01:35:35.191671+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-role-matrix.ts

## Purpose

Generates the effective role-permission matrix tables in `docs/demo-ecommerce/index.md` and per-module "who can do what" tables in `docs/modules/*.md`. It answers "which rules does a role actually hold, per module?" by asking the real evaluator (`heldRules`) rather than re-expanding sets, so the docs always reflect what a route guard would answer. Prose around the marker blocks is left untouched.

## Key elements

- **`personas`** — the row set: all `AUDIENCE_NAMES` (guest, customer, etc.) followed by every `PRESET_ROLES` entry except `system`. Each maps to a scope, optional role name, and audience.
- **`callerFor(persona)`** — resolves a persona to a `Caller` via `keysInScope` + `assembleCaller`, giving `heldRules` the exact input the evaluator sees.
- **`cell(caller, module)`** — produces one letter-code string (e.g. `Rc`) for a role in a module. Uppercase = unconditional rule; lowercase = condition-narrowed; `—` = nothing held. Expands `IMPLIED_ACTIONS`.
- **`effectiveTable()` / `body()`** — assembles the main matrix table plus its legend for `docs/demo-ecommerce/index.md`.
- **`ruleCell(rule, caller)`** — per-rule cell for module pages: `✅`, `✅ own`, step-up mark (`⚡c`/`⚡s`), or `—`.
- **`moduleBody(pageModules)`** — assembles the per-module table (rule × persona + sets + credential + description) for a given docs page.
- **`pageOf(module)`** — maps a module name to its docs page file (`core` → `locales`, `example` → none).
- **`modulesByPage()`** — groups modules by the page that documents them.
- **`pages`** — the list of all `{ file, blocks, label }` entries this script owns (main matrix + one per module page).
- **`run()`** — iterates `pages`, calls `applyMarkerBlocks` on each, and returns the worst exit code. Invoked at the bottom; errors route through `failScript`.

## Relationships

- **`src/kernel/permissions.ts`** — primary data source: `PERMISSION_RULES`, `PERMISSION_SETS`, `PRESET_ROLES`, `AUDIENCE_NAMES`, `IMPLIED_ACTIONS`, `keysInScope`, `assembleCaller`.
- **`src/kernel/ability.ts`** — provides `heldRules`, the single authority for "which rules does this caller hold."
- **`scripts/docs/marker-block.ts`** — provides `applyMarkerBlocks`, which writes or checks the generated block between marker comments on each page.
- **`scripts/cli.ts`** — provides `hasFlag('check')` to enable drift-reporting mode.
- **`scripts/modules-on-disk.ts`** — provides `REPO_ROOT` so paths resolve correctly regardless of CWD.
- **`scripts/fail-script.ts`** — provides `failScript` as the top-level error handler (prints context, exits non-zero).
- **`src/types/index.ts`** — type imports: `AuthorizationScope`, `Caller`.

## Notes

- **`system` is deliberately excluded.** It is `admin`'s permission list under an alias (see `shared/authorization-roles.yaml`); including it would duplicate `admin`'s row and mislead readers, since an operator never assigns `system`.
- **`guest` and `unverified` are included as baselines** even though no role "holds" them — they are the reference rows every other row is compared against.
- **Single source of truth for "what may this role do"**: the script asks `heldRules` rather than re-expanding `PERMISSION_SETS` locally, avoiding a second (potentially stale) expander.
- **`core` module rules appear on the `locales` page**, not `core.md`; **`example` has no page** by design (it exists to be copied).
- **`--check` mode** (detected via `hasFlag`) reports drift without writing, so CI can run it against a clean tree.
- The `callerFor` helper builds a synthetic caller (`'generated'` as id/tenant) because no real `AuthContext` exists in a CLI script; the comment notes it agrees with `callerInScope` on the `permissions` field.
