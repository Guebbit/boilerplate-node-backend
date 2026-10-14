---
source: scripts/docs/generate-role-matrix.ts
sha256: d659819f55ed844d7a7d14c056cf891913104e0cebaa561b5e08ac9dad50db6e
generated_at: 2026-10-14T07:16:27.893486+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-role-matrix.ts

## Purpose

Generates (or checks) the single effective role-permission matrix table embedded in `docs/demo-ecommerce/index.md`. It computes, for every documented role and every module, exactly which permission keys the role holds by delegating to the kernel's `heldKeys` evaluator, then writes the result as a compact Markdown table between `<!-- role-matrix:start/end -->` markers. Prose outside the markers is never touched.

## Key elements

- **`checkOnly`** — sets to `true` when `--check` is in `argv`; causes the script to report drift instead of rewriting the page.
- **`roles`** — ordered list: `ANONYMOUS_ROLE` first, then `PRESET_ROLES` minus `system`. `system` is excluded because it is an alias for `admin`'s list and is never operator-assigned.
- **`modules`** — unique module names extracted from `PERMISSION_KEYS` in declaration order; becomes the table columns.
- **`callerFor(name, scope)`** — builds a `Caller` object the evaluator expects. Unions the anonymous baseline into non-anonymous roles' permissions, computes `unrestricted` and `level`, and sets `tenantId` / `system` to fixed sentinels.
- **`codes`** — maps each action verb to a single letter (`r`, `c`, `u`, `d`, `x`, `s`, `o`) so the table stays narrow.
- **`breadthOf(key)`** — returns the second-to-last dot segment of a permission key (the breadth token: `any` or `self`).
- **`cell(caller, module)`** — for one role×module intersection, returns a string of action letters; uppercase means the `any`-breadth key is held, lowercase means `self` only; `—` means nothing.
- **`effectiveTable()`** — assembles the full Markdown table (header, separator, one row per role).
- **`body()`** — wraps the table with a short legend and a one-paragraph reading guide.
- **`applyMarkerBlocks` call** — the entry point; writes `body()` into the target page or checks for drift, then sets `process.exitCode`.

## Relationships

- **`src/kernel/permissions.ts`** — source of `ANONYMOUS_ROLE`, `PERMISSION_KEYS`, `PRESET_ROLES`, `permissionsOfRole`, `isUnrestricted`, `levelOfRole`. The script reads the role/permission model but never mutates it.
- **`src/kernel/ability.ts`** — provides `heldKeys`, the single expansion function the script uses to determine which keys a role actually holds. The script deliberately does *not* use `holdsKey` (see Notes).
- **`scripts/docs/marker-block.ts`** — provides `applyMarkerBlocks`, the shared read/replace-or-check mechanism for marker-delimited blocks in docs pages.
- **`src/types/index.ts`** — source of the `AuthorizationScope` and `Caller` type imports used to shape `callerFor`'s return value.

## Notes

- **`heldKeys` vs `holdsKey`:** the script intentionally uses `heldKeys` (returns the full set of keys) rather than `holdsKey` (collapses breadth into a boolean). The table must show *which* keys are held, not just *whether* a role can act.
- **`system` is excluded, `guest` is included.** `system` would duplicate `admin`; `guest` is included as the comparison baseline even though no user logs in as it.
- **Uppercase = `any` breadth, lowercase = `self` breadth.** This encoding means a ten-column table still fits a wiki page without a separate legend per column.
- **`--check` is the CI path.** `complete` invokes the script with `--check`; the script then exits non-zero on drift without modifying the file. The `driftSubject` and `rerunScript` strings passed to `applyMarkerBlocks` tell the developer what changed and how to regenerate.
- **`callerFor` duplicates part of `callerInScope`'s logic** (anonymous-baseline union) because the script has no live `AuthContext`. The two implementations agree because both read `permissionsOfRole`; this is acknowledged in the inline comment.
