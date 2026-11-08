---
source: scripts/docs/generate-persona-tables.ts
sha256: 8ce577d640eb27f727c24b3438567a1936a1d51b9fe526f8fa610502674adad0
generated_at: 2026-11-08T02:48:09.004509+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-persona-tables.ts

## Purpose

Generates three Markdown account tables (named, persona, staff) inside `docs/tools/demo-profile.md` from the persona data in `shared/scenarios/personas.yaml`. It exists so that login addresses and roles in the doc page stay in sync with the source-of-truth YAML, avoiding silent staleness when an email or role changes.

## Key elements

- **`GROUPS`** — Maps each table (`named`, `persona`, `staff`) to an ordered list of `PersonaName` keys to display.
- **`rolesOf(persona)`** — Returns a display string for the persona's memberships; falls back to the literal word `customer` when there are none (a computed label, not a granted role).
- **`stateOf(persona)`** — Returns a human-readable summary of non-default state flags (verification, active, 2FA, TOTP, pending email, analytics consent).
- **`table(names)`** — Renders a single Markdown table (Account | Login | Roles | State) for a group of persona names.
- **`applyMarkerBlocks` call** — Orchestrates writing the three tables between `<!-- persona-{group}:start/end -->` markers in the target page; in `--check` mode it reports drift instead of rewriting.
- **`checkOnly`** — Set from `hasFlag('check')`; determines whether the script validates or writes.

## Relationships

- **`scenarios/personas-schema.ts`** — Source of the `personas` data object and the `Persona` / `PersonaName` types used throughout.
- **`scripts/docs/marker-block.ts`** — Provides `applyMarkerBlocks`, the shared utility that inserts or checks generated content between HTML-comment markers in a Markdown file.
- **`scripts/cli.ts`** — Provides `hasFlag` for reading the `--check` CLI flag.
- **`scripts/fail-script.ts`** — Provides `failScript`, used as the `.catch` handler to produce a clean error exit.
- **`scripts/modules-on-disk.ts`** — Provides `REPO_ROOT` to resolve the absolute path to the target page.

## Notes

- Follows the same pattern as `generate-rate-limit-budgets.ts` (same marker-block mechanism, same `--check` semantics).
- The `customer` string in `rolesOf` is a display convention for personas with zero memberships; it is **not** a role that appears in any `memberships` array.
- Exit code is set via `process.exitCode = code` (not `process.exit`), allowing pending I/O to flush.
- Marker comments in the target page are `<!-- persona-named:start -->`, `<!-- persona-persona:start -->`, `<!-- persona-staff:start -->` (and matching `:end`); content between them is fully owned by this script.
