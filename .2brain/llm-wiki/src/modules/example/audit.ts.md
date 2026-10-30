---
source: src/modules/example/audit.ts
sha256: 4621e89ab73ab3ade54bd9e3eded8cfdebc48fb48345b46fdb1e288e26379f55
generated_at: 2026-10-29T03:51:05.737574+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/audit.ts

## Purpose

Declares the audit-action vocabulary for the `example` module and registers it into the app-wide `AuditActionMap` union. The actions themselves (create, update, status change, delete, cover change) are generated from `rules.yaml` and re-exported here so that downstream services and tests can reference them through a single, typed entry point.

## Key elements

- **`exampleAuditActions`** — Re-exported from `./rules.generated`. A readonly object whose keys are the action names listed in `rules.yaml` and whose values are the canonical action identifiers.
- **Module augmentation (`@infrastructure/observability/audit`)** — Adds an `example` entry to the `AuditActionMap` interface, typed as a union of `exampleAuditActions`'s values. This is what makes the app-wide `AuditAction` union grow automatically when this module is enabled.

## Relationships

- **`src/modules/example/rules.generated.ts`** — Sole import source; provides the `exampleAuditActions` object that this file re-exports and types against.
- **`src/modules/example/services/crud.ts`, `services/transition.ts`, `services/cover.ts`** — The services whose operations (create/update/delete, status change, cover change) correspond one-to-one with the actions defined here. They consume the `AuditActionMap['example']` type when emitting audit events.
- **`src/modules/example/tests/integration/capabilities.test.ts`, `tests/integration/service.test.ts`** — Integration tests that assert the audit trail produced by those services matches this module's action vocabulary.

## Notes

- This file contains **no runtime logic** beyond the re-export and the `declare module` block. It exists purely for type-level composition.
- The action list is derived from `rules.yaml`; adding or removing an action there and regenerating `rules.generated.ts` is the only way to change the vocabulary. Editing this file directly will not take effect.
- The doc comment points to `docs/tools/winston.md` for the broader audit-logging pipeline this module plugs into.
