---
source: src/infrastructure/config/dotenv.ts
sha256: 537e4cc2e0dff8b0f8344306e4218ecead62a1ec4aa32217b2ab5e344b73a38c
generated_at: 2026-10-14T07:51:11.356134+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/dotenv.ts

## Purpose

Side-effect module that loads `.env` into `process.env` (via `dotenv/config`) and then notifies the config store so it can re-read the environment. It exists as a single first-import in every entry point to guarantee that no config read happens before the file is parsed.

## Key elements

- **Side-effect import of `dotenv/config`** — loads `.env` from the working directory into `process.env`, skipping any key the shell already set.
- **`refreshEnvironment()` call** — imported from `./store`; re-reads `process.env` after `.env` has been applied, correcting any snapshot the store may have taken earlier.
- **No named exports** — the module is consumed purely for its import-time side effects.

## Relationships

- **`./store` (config store)** — calls `refreshEnvironment()` so the store's cached snapshot picks up the freshly loaded values.
- **All graph neighbors** (every `scripts/ops/reap-*`, `scripts/db/*`, `scenarios/apply.ts`, `scenarios/support/development-doubles.ts`, `scenarios/tools/generate-seed-images.ts`) — import this module as their first statement so that `.env` is loaded before any downstream config access.

## Notes

- Order matters: it must be the **first** import in an entry point. A config read that runs before this file executes will freeze a snapshot missing `.env` values.
- It deliberately **never overrides** shell-provided variables; that is `dotenv`'s default and is relied upon (e.g. to let a CI secret shadow a local `.env` entry).
- See `docs/tools/configuration.md` for the broader configuration contract.
