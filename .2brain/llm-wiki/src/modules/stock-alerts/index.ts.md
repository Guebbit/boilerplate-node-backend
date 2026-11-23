---
source: src/modules/stock-alerts/index.ts
source_sha256: 10f4b9a8e1baea7cd81414127143e58af2173d3bd3d601239f935e79de0a3e3b
context_sha256: 3f2fbc5a7b7f6f1e7e1a360a7627914690577b6ca4b59b5ec2821ab5cf0d0380
generated_at: 2026-11-22T07:54:17.269935+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/index.ts

## Purpose
Public barrel for the `stock-alerts` module. Its doc comment states it is the only surface a sibling module may import, so other modules reach stock-alerts only through this file rather than its internals.

## Key elements
- `export * from './service'`: re-exports everything from the module's service.
- `export * from './events'`: re-exports everything from the module's events.
- `export * from './emails'`: re-exports everything from the module's emails.
- `export type * from './model'`: re-exports the module's model as types only, so no runtime values from it pass through the barrel.

The file declares no logic of its own.

## Relationships
- Aggregates `service.ts`, `events.ts`, `emails.ts` and `model.ts` from the same directory.
- Of the listed neighbors, `src/modules/shop-tasks/module.ts` and `src/modules/shop-tasks/tests/integration/notices.test.ts` are likely consumers of this barrel. The tests `tests/integration/draft-language-never-leaks.test.ts` and `tests/unit/infrastructure/adapters/mailer-templates.test.ts` are also related through the dependency graph. The file content doesn't show how any of these use it.

## Notes
- Because everything is re-exported with `export *`, any new public export added to `service`, `events` or `emails` becomes part of the module's public surface automatically.
- The model is exposed as types only. Consumers cannot import runtime values from it through this barrel.
- The doc comment references design documentation on the "Published Language — the barrel" pattern and on the module's "neighbourhood" for the rationale.
