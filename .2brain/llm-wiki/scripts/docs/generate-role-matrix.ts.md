---
source: scripts/docs/generate-role-matrix.ts
sha256: 6e58b3dbd4132d864f6df83ac3d49c540a5e20aaac2210d3f754d07816059ee2
generated_at: 2026-09-27T13:56:03.924023+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-role-matrix.ts

## Purpose

Generates the effective role-permission matrix in `docs/demo-ecommerce/index.md` — a single table showing which permission keys each role actually holds per module, computed via `heldKeys` rather than hand-written. It exists because the effective permission set (anonymous baseline union, `any`-vs-`self` breadth) is not reliably derivable by eye, and re-expanding keys in a second location would create a second source of truth. Supports `--check` to report drift without rewriting (used by `complete`).

## Key elements

- **`checkOnly`** — boolean from `--check` in `process.argv`; switches `applyMarkerBlocks` to report-only mode.
- **`roles`** — `[ANONYMOUS_ROLE, ...PRESET_ROLES]`; `guest` is first as the baseline every other row is compared against.
- **`modules`** — unique module names from `PERMISSION_KEYS` in declaration order; these become the table's columns.
- **`callerFor(name, scope)`** — builds a `Caller` for a role without an `AuthContext`. Manually unions `ANONYMOUS_ROLE.permissions` for non-anonymous roles (the same baseline the kernel applies), and calls `isUnrestricted`.
- **`codes`** — one-letter action codes (`r`, `c`, `u`, `d`, `x`, `s`, `o`) so a wide table fits on one page.
- **`breadthOf(key)`** — extracts the second-to-last dot segment (e.g. `any`, `self`) to distinguish breadth.
- **`cell(caller, module)`** — the per-cell logic: uses `heldKeys(caller)` to get the effective key set, filters to the module, then emits one code letter per action held. Uppercase = `any`-breadth key held, lowercase = `self`-breadth only, em-dash = nothing.
- **`effectiveTable()`** — assembles the full Markdown table (header + separator + one row per role).
- **`body()`** — the complete block written between markers: a short intro line, the table, a legend, and a closing prose note about `operator` vs `admin`.
- **`applyMarkerBlocks(...)`** — writes the block into `PAGE` or reports drift; sets `process.exitCode`.

## Relationships

- **`src/kernel/permissions.ts`** — source of `ANONYMOUS_ROLE`, `PERMISSION_KEYS`, `PRESET_ROLES`, `permissionsOfRole`, and `isUnrestricted`. The script reads role definitions and the flat key list from here.
- **`src/kernel/ability.ts`** — source of `heldKeys`, the function that resolves a `Caller` to the set of keys it actually holds (including baseline union). The script deliberately uses `heldKeys` over `holdsKey` to preserve breadth granularity.
- **`scripts/docs/marker-block.ts`** — provides `applyMarkerBlocks`, the shared mechanism for idempotently replacing a delimited section in a Markdown file and for `--check` drift reporting.
- **`src/types/index.ts`** — source of the `AuthorizationScope` and `Caller` types used to construct the synthetic caller objects.

## Notes

- The script intentionally does **not** use `callerInScope` (which requires a full `AuthContext`/request); it reconstructs the `Caller` directly from `permissionsOfRole` plus the anonymous baseline union. The comment notes the two agree on `permissions` because both read the same source.
- `heldKeys` is used instead of `holdsKey` on purpose: `holdsKey` collapses `any`- and `self`-breadth keys sharing an action+subject into a single boolean, which is correct for a route guard but loses the breadth distinction the table needs.
- The anonymous baseline union is applied **inside** `callerFor` for non-anonymous roles (and is the entire permission set for the anonymous role itself), mirroring what the kernel does at request time.
- `operator` is the only role scoped outside the shop; its row will be empty for all shop modules by design.
- Rerun command referenced in drift messages: `docs:roles`.
