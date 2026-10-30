---
source: scenarios/scenarios.generated.ts
sha256: 6ee277837b5e7055db08d6d2d61a28701c937cfc52c98807a1ecafe1b309e837
generated_at: 2026-10-29T01:25:16.598397+00:00
model: ollama:qwen3.8:27b
---

# scenarios/scenarios.generated.ts

## Purpose
Auto-generated barrel file that aggregates all `*.scenario.ts` modules into a single `scenarioFixtures` export. It exists so that `scenarios/index.ts` can register every scenario in one place without manually importing each file. Regenerated via `npm run regenerate`; adding or deleting a `.scenario.ts` file is the only way to change its contents.

## Key elements
- **`scenarioFixtures`** (exported const) — An object mapping scenario names to their exported `scenario` value. Currently contains a single entry: `shop` (imported from `./shop.scenario`).
- **`import { scenario as shop }`** — Pulls the default `scenario` export from `shop.scenario.ts` and re-exports it under the key `shop`.

## Relationships
- **`scenarios/shop.scenario.ts`** — Source of the `shop` fixture; this file imports its `scenario` export.
- **`scenarios/index.ts`** — Consumes `scenarioFixtures`, adds a `blank` entry, and registers all scenarios. This file is its upstream dependency.

## Notes
- **Do not edit by hand.** The header comment and module doc both state the file is generated; any manual change will be overwritten by `npm run regenerate`.
- The object literal is intentionally flat (`{ shop }`), not an array. `scenarios/index.ts` appends `blank` before registration, so the final registry is always larger than what this file exports.
- Adding a new scenario means creating `<name>.scenario.ts` and re-running the generator—not editing this file.
