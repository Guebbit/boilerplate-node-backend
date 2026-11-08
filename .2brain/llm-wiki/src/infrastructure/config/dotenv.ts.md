---
source: src/infrastructure/config/dotenv.ts
sha256: 537e4cc2e0dff8b0f8344306e4218ecead62a1ec4aa32217b2ab5e344b73a38c
generated_at: 2026-11-08T03:24:54.187150+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/dotenv.ts

## Purpose

A side-effect-only module that loads the project's `.env` file into `process.env` and then signals the config store to re-read it. It exists so that entry points can import it first, guaranteeing that `.env` values are present before the store freezes its one-time snapshot of `process.env`. The module exports nothing.

## Key elements

- **`import 'dotenv/config'`** — Loads `.env` from the working directory into `process.env`. Keys already set by the shell are never overridden (dotenv's built-in rule).
- **`refreshEnvironment()` call** — Imported from `./store`; invoked immediately after the dotenv import to tell the config store to re-snapshot `process.env` now that `.env` keys are present.

## Relationships

- **`src/infrastructure/config/store.ts`** — Source of `refreshEnvironment`. This file calls it so the store's cached environment includes `.env` values; the store is the only project-internal dependency.
- **`src/app.ts` / `src/cluster.ts`** — Entry points that import this module first (for its side effect alone) before any other config-dependent code runs.
- **Downstream consumers** (scenarios, scripts, ops tooling listed in the graph) depend transitively on this file having run so that their reads through the config store see `.env` values.

## Notes

- Import order matters: this module must be the **first** import in any entry point. If the store reads `process.env` before `.env` is loaded, the snapshot is permanently missing those keys.
- The file has no named exports; importing it is purely for the two side effects (dotenv load + `refreshEnvironment` call).
- Shell-level variables always win over `.env` values — this is dotenv's contract, not something this file controls.
