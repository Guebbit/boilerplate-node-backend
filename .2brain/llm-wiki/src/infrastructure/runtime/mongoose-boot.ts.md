---
source: src/infrastructure/runtime/mongoose-boot.ts
sha256: 11b4f58dccabf6ddd68d571827b8a55d92349aa2be0ea5510f3e844f2f15774d
generated_at: 2026-10-14T08:13:45.625511+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/mongoose-boot.ts

## Purpose

A side-effect-only bootstrap module that applies Mongoose global defaults before any model module is evaluated. It exists to work around ES import hoisting: because `import` statements are hoisted above subsequent code, the only reliable way to guarantee the defaults are set *before* model definitions run is to make this file the very first import in an entry point.

## Key elements

- **`applyMongooseDefaults()`** (imported from `./mongoose-defaults`) — the single call made at module evaluation time. It configures Mongoose global options (strict mode, timestamps, or other driver-level settings) so that every subsequently-loaded model inherits them.
- The module exports nothing; it is consumed purely for its side effect.

## Relationships

- **Imported by every server and ops entry point** listed in the dependency graph (`scenarios/apply.ts`, `scenarios/run-server.ts`, `scripts/db/*`, `scripts/ops/reap-*.ts`). Each of these files must place `import './mongoose-boot'` (or the equivalent path) as its *first* import so the defaults land before any `mongoose.model()` / `Schema` definition executes.
- **Depends on `./mongoose-defaults`** for the actual configuration logic; this file is just the one-line invocation wrapper.

## Notes

- **Order is contractual.** If a future refactor moves this import below a model import, Mongoose will have already frozen per-model defaults and the settings will silently not apply. The doc comment in the file calls this out explicitly.
- Because it is a `@module` (no named exports), tree-shaking or bundler reordering could theoretically drop it; ensure bundler configs preserve side-effect imports (`"sideEffects": ["**/mongoose-boot.ts"]` or equivalent).
- Do **not** add logic beyond the single call. Any extra code here would run at the same hoisted-early moment and is hard to reason about across fifteen+ entry points.
