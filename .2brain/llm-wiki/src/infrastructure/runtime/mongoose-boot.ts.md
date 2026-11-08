---
source: src/infrastructure/runtime/mongoose-boot.ts
sha256: 11b4f58dccabf6ddd68d571827b8a55d92349aa2be0ea5510f3e844f2f15774d
generated_at: 2026-11-08T03:46:46.798043+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/mongoose-boot.ts

## Purpose

A side-effect-only module that applies Mongoose global defaults (from `mongoose-defaults.ts`) before any model module is evaluated. Entry points import it as their **first** import to guarantee ordering, since ES import hoisting would make a post-import call too late.

## Key elements

- **Module (no exports):** The sole action is a single `applyMongooseDefaults()` call at top level. Its entire value is the import side effect.
- **`applyMongooseDefaults` (imported from `./mongoose-defaults`):** Configures Mongoose global options (e.g. `strictQuery`, `toJSON` settings). The specific options live in `mongoose-defaults.ts`.

## Relationships

- **Imports →** `src/infrastructure/runtime/mongoose-defaults.ts` – provides the `applyMongooseDefaults` function that configures Mongoose globals.
- **Imported by (must be the *first* import):** `src/serve.ts`, `src/cluster.ts`, `scenarios/apply.ts`, `scenarios/run-server.ts`, `scripts/db/bootstrap-access.ts`, `scripts/db/sync-indexes.ts`, `scripts/ops/reapply-erasures.ts`, `scripts/ops/reencrypt.ts`, `scripts/ops/run-job.ts`, `tests/support/setup.ts` – all entry points that need Mongoose defaults applied before their model imports are evaluated.

## Notes

- **Ordering is load-bearing.** This file *must* appear before any `mongoose.model(...)` or schema-definition import in the consuming entry point. If a model import is hoisted above the boot import, defaults are applied too late and silently ignored.
- **No re-export:** There is nothing to import from this file other than the side effect. Do not add named exports without re-evaluating the ordering guarantee.
- **One-liner by design.** Resist adding conditional logic or environment checks here; keep the "import = configure" contract unambiguous.
