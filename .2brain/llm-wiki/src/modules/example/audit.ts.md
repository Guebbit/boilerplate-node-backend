---
source: src/modules/example/audit.ts
generated_at: 2026-11-22T05:06:36.014935+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/example/audit.ts

## Purpose
Declares the audit actions emitted by the `example` module. It re-exports the generated action vocabulary and augments the app-wide `AuditActionMap` type, so the global audit action union grows only when this module is enabled. The actions cover create, update, status change, delete and cover change of an example, and are listed in `rules.yaml`.

## Key elements
- `exampleAuditActions`: re-exported from `./rules.generated`. This is the action vocabulary generated from `rules.yaml`.
- `declare module '@infrastructure/observability/audit'`: a module augmentation that adds an `example` key to `AuditActionMap`. Its value type is the union of the values of `exampleAuditActions`.

## Relationships
- The file's doc comment says the actions are for create, update, status change, delete and cover change. These match the neighbors `src/modules/example/services/crud.ts`, `src/modules/example/services/transition.ts` and `src/modules/example/services/cover.ts`, which are the likely emitters. This is inferred from the names, since the file has no runtime imports of them.
- `src/modules/example/tests/integration/service.test.ts` and `src/modules/example/tests/integration/capabilities.test.ts` are related through the dependency graph. The file does not show how they use it.
- Outside the neighbor list, the file imports the generated `./rules.generated` and augments `@infrastructure/observability/audit`.

## Notes
- It holds no runtime logic. The only runtime effect is the re-export, and the augmentation exists purely at the type level.
- Edit `rules.yaml` to change the actions rather than this file, because the vocabulary is generated.
- The doc comment points to `src/modules/account/audit.ts` for why augmentation is used, and to an audit-events section of a docs page on winston logging.
