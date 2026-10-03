---
source: scripts/setup/required-keys.ts
sha256: 268841abb5834080a312c9d844211e87befc0534928e724109b0c53743c2289e
generated_at: 2026-10-01T12:40:49.650619+00:00
model: ollama:qwen3.8:27b
---

# scripts/setup/required-keys.ts

## Purpose

Derives the authoritative list of environment variables that `npm run setup` may populate, by reading each enabled module's and the app's config field declarations. Because the list is computed from the config schema rather than hard-coded, a newly added module secret is automatically included without touching this file.

## Key elements

- **`FillableKey` (interface)** — a pair of `{ key, placeholder }` representing one env var and the exact placeholder string it replaces.
- **`fillableKeys()` (exported function)** — iterates every field in `allConfigSlices(enabledModules)`; for fields whose `presence` rule declares a `placeholder`, records the field name → placeholder mapping (deduplicated via a `Map`). Returns the collected entries as `FillableKey[]`.

## Relationships

- **`src/app/config.ts`** — imports `allConfigSlices`, the single source of truth for config field definitions (name, presence rule, placeholder).
- **`src/modules.ts`** — imports `enabledModules` to scope which module config slices are considered.
- **`scripts/setup/index.ts`** — the setup entry point; consumes `fillableKeys()` to know which placeholders to prompt for / fill.
- **`scripts/setup/environment-file.ts`** — writes the resolved values into the environment file; relies on this module's output to know the key set.
- **`tests/unit/scripts/setup/required-keys.test.ts`** — unit tests covering the derivation logic and deduplication.
- **`tests/unit/scripts/setup/first-run.test.ts`** — integration-level test for the first-run flow that depends on the key list being correct.

## Notes

- Fields **without** a `placeholder` (e.g. `NODE_URL`, `NODE_CORS_ORIGIN`) are intentionally excluded: they denote a *missing* value whose correct content is the operator's choice, not a template substitution.
- The `Map` in `fillableKeys()` deduplicates by field name, so if the app tier and a module both declare a field with the same name, the last one seen wins.
- The design mirrors `assertModuleConfig` (in `kernel/module-config.ts`), which likewise folds module-declared and app-level slices together rather than maintaining a separate hardcoded list.
