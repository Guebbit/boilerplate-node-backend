---
source: scripts/docs/generate-role-matrix.ts
generated_at: 2026-11-22T02:04:04.066435+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/generate-role-matrix.ts

## Purpose

A `tsx` script that generates the *effective* role matrix on the docs "start" page for using the shop, plus a "who can do what" table on each module's docs page. It exists because these answers can't be reliably written by hand: `admin` holds many named tenant sets, and every signed-in caller is a customer first. The script rewrites only the content between marker comments and leaves the surrounding prose alone. With `--check` it reports drift instead of writing, which is how `complete` runs it.

## Key elements

- `checkOnly`: set by `hasFlag('check')`. Switches between rewriting pages and reporting drift.
- `PAGE`, `START`/`END`: the start page (`docs/use-the-shop/start.md` as the script's path constant) and its `<!-- role-matrix:start/end -->` markers.
- `MODULE_START`/`MODULE_END`: the `<!-- permissions:start/end -->` markers used on module pages.
- `Persona` and `personas`: the table rows.
  - One row per audience name (`guest`, `unverified`, and so on), included as baselines.
  - One row per preset role except `system`, each acting as a `customer` audience.
  - `system` is excluded because it is `admin`'s permission list under an alias.
- `modules`: the distinct `module` values across `PERMISSION_RULES`, in declaration order. These are the matrix columns.
- `callerFor(persona)`: builds a `Caller` through `keysInScope` and `assembleCaller`. It does not use `callerInScope`, which needs a request-based `AuthContext`.
- `codes` and `cell(caller, module)`: render one matrix cell as action letters (`r c u d x s o`).
  - UPPERCASE means a rule with no conditions. Lowercase means a condition narrows it.
  - `—` means nothing is held.
  - Implied actions from `IMPLIED_ACTIONS` are folded in.
- `effectiveTable()` and `body()`: build the role × module table and its legend and prose.
- `pageOf(module)` and `modulesByPage()`: map modules to docs pages under `docs/modules/`.
  - `core` maps to the `locales` page.
  - `example` has no page.
- `ruleCell(rule, caller)`: renders a per-rule cell as ✅, `own` when a condition references `$caller`, and ⚡c/⚡s step-up marks.
- `moduleBody(pageModules)`: builds the per-module table. It has one row per rule, with the sets that bundle it, one column per persona, and a Credential column.
- `pages`: the list of files and blocks to manage, with the matrix first.
- `run()`: calls `applyMarkerBlocks` on each page in turn and returns the worst exit code.

## Relationships

- `@kernel/permissions` supplies `AUDIENCE_NAMES`, `IMPLIED_ACTIONS`, `PERMISSION_RULES`, `PERMISSION_SETS`, `PRESET_ROLES`, `assembleCaller` and `keysInScope`.
- `@kernel/ability` supplies `heldRules`. All "what may this role do" answers go through it, so the script has no second expander.
- `./marker-block` supplies `applyMarkerBlocks`, which does the in-place marker rewriting and the check mode.
- `../cli` supplies `hasFlag`.
- `../modules-on-disk` supplies `REPO_ROOT`.
- `../fail-script` supplies `failScript`. It is imported here, but its use falls outside the visible part of the file.
- The `@types` import provides `AuthorizationScope` and `Caller`.
- Other neighbors (cache and idempotency middlewares, preconditions, controllers, services, `scenarios/flows/client.ts`) have no visible interaction in this file.

## Notes

- Tables are generated only. What a role *declares* is hand-written prose derived from `shared/rules/authorization-roles.yaml`, and no generated copy of it is kept.
- Every page is processed even if an earlier one is stale, so one stale page doesn't hide another.
- The `pages` array is built at module load, so the table bodies are computed before `run()` is called.
- `callerFor` always uses the placeholder identity `'generated'`, never `system`. A `guest` gets no user, and a platform-scope persona gets no tenant.
- The matrix legend notes that `operator` sits outside the shop entirely, and that `admin` cannot reach observability either.
