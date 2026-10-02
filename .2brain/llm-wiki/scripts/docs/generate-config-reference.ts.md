---
source: scripts/docs/generate-config-reference.ts
sha256: 165b0d43c275cb857c49d8c13b4f54c8d13e00d915446d0958b5ea2c8ee689b1
generated_at: 2026-10-01T12:29:30.107338+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/generate-config-reference.ts

## Purpose

Generates the configuration reference table in `docs/tools/configuration.md` by reading every environment variable definition straight from the app's `defineConfig` slices (plus the seeder's own slice). It exists so the variable list cannot go stale: the source of truth is the same code the boot gate validates, and ESLint's `no-restricted-properties` rule forbids raw `process.env` reads in `src/`, making the list complete by construction.

## Key elements

- **`checkOnly`** — set when `--check` is passed (the mode `complete` uses); reports drift instead of rewriting the page.
- **`isBudgetSlice`** — returns true for slices whose name ends in `-rate-limits`; those variables are excluded because they are documented in `docs/tools/security.md`.
- **`rules(field)`** — builds the "Rules" column text from a field's `presence` (required, min-length, placeholder, production-only), `forbiddenOutsideRelaxed`, and `sensitive` flags.
- **`cell(text)`** — escapes `|` characters so they don't split a Markdown table row.
- **`collect()`** — iterates all non-budget slices, deduplicates variables, and flags any variable declared with a different type or default by two slices (a hard error).
- **`table(name, fields)`** — renders one slice as a Markdown table with columns: Variable, Type, Default, Rules, What it does.
- **Main flow** — calls `collect()`, exits with code 1 on conflicts; otherwise calls `applyMarkerBlocks` to write (or verify) the generated block between the `config-reference:start/end` markers in `docs/tools/configuration.md`.

## Relationships

- **`src/app/config.ts`** — imports `allConfigSlices`, the array of config slices the app boots with.
- **`src/modules.ts`** — imports `enabledModules`, passed to `allConfigSlices` so only active slices are included.
- **`src/infrastructure/config/define.ts`** — provides the `ConfigSlice` and `FieldInfo` types used throughout.
- **`scenarios/config.ts`** — imports `seedPasswordsConfig`, the seeder's own config slice that the app never boots with but still declares variables.
- **`scripts/docs/marker-block.ts`** — imports `applyMarkerBlocks`, the shared utility that inserts or verifies a generated block between HTML-comment markers in a Markdown page.

## Notes

- Rate-limit budget slices (`*-rate-limits`) are deliberately excluded; their variables live in `docs/tools/security.md` to avoid duplication.
- A variable declared by two slices with a different `type` or `default` is a hard error (exit 1), not a silent pick — one reader would be parsing a value the other doesn't expect.
- Run with `--check` (as `complete` does) to report drift without writing; run normally (via the `docs:config` npm script) to regenerate.
- The completeness guarantee is structural: any variable not declared in a slice simply cannot be read from `src/` because ESLint blocks `process.env` there.
