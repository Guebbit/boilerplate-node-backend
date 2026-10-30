---
source: scripts/docs/generate-persona-tables.ts
sha256: 8ce577d640eb27f727c24b3438567a1936a1d51b9fe526f8fa610502674adad0
generated_at: 2026-10-29T01:35:02.367164+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-persona-tables.ts

## Purpose

Generates three account tables (named, persona, staff) inside `docs/tools/demo-profile.md` from the persona data defined in `shared/scenarios/personas.yaml` (exposed via the schema module). The tables sit between HTML-comment marker pairs so surrounding prose is never touched. Exists because a hand-maintained table of logins and roles goes stale silently whenever the YAML changes.

## Key elements

- **`GROUPS`** – const object mapping table names (`named`, `persona`, `staff`) to ordered arrays of `PersonaName` values. Uses `satisfies Record<string, readonly PersonaName[]>` for type-checking without widening.
- **`rolesOf(persona)`** – Returns a display string for an account's memberships (`scope \`role\`` joined by ` + `), or the literal word `customer` when the persona has zero memberships (a computed label, never a granted role).
- **`stateOf(persona)`** – Builds a human-readable summary of non-default state flags (unverified, inactive, 2FA, TOTP, pending email, analytics consent) or returns `verified customer` when none apply.
- **`table(names)`** – Renders a single Markdown table (Account | Login | Roles | State) for the given list of persona names.
- **`checkOnly`** – Boolean derived from `hasFlag('check')`; when true, the script reports drift instead of rewriting the page.
- **Main invocation** – Calls `applyMarkerBlocks` with three blocks (one per group), using `persona-<group>:start`/`end` marker comments, and sets `process.exitCode` from the result.

## Relationships

- **`scenarios/personas-schema.ts`** – Source of the `personas` data object and the `Persona` / `PersonaName` types.
- **`scripts/docs/marker-block.ts`** – Provides `applyMarkerBlocks`, the shared generate-or-check mechanism that reads/writes the marked region in the target page.
- **`scripts/cli.ts`** – Provides `hasFlag` to detect the `--check` flag.
- **`scripts/fail-script.ts`** – Provides `failScript`, used as the rejection handler to exit with a non-zero code and message.
- **`scripts/modules-on-disk.ts`** – Provides `REPO_ROOT`, used to resolve the absolute path to the target Markdown page.

## Notes

- The `driftSubject` passed to `applyMarkerBlocks` is the YAML file path (`shared/scenarios/personas.yaml`), not the TS schema module — so drift reports point developers at the source of truth.
- The `customer` role label in `rolesOf` is purely presentational; no such membership exists in the data.
- Follows the same marker-block pattern as `generate-rate-limit-budgets.ts` (noted in the file header).
