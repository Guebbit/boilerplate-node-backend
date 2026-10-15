---
source: src/modules/example/audit.ts
sha256: 3103452f467ec0744ced4a380f9208734ab181040fab49d07b89b2060c79cbd7
generated_at: 2026-10-15T10:29:52.400308+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/audit.ts

## Purpose

Declares the audit-action vocabulary owned by the `example` module and registers it into the app-wide `AuditActionMap` union via TypeScript module augmentation. This lets the observability infrastructure (`@infrastructure/observability/audit`) understand every valid action the module can emit, while keeping the union open for extension by other modules.

## Key elements

- **`exampleAuditActions`** (exported const) — The four action strings this module may emit: `example.created`, `example.updated`, `example.deleted`, `example.cover_changed`. Typed as a const assertion so each key maps to a literal type.
- **`declare module '@infrastructure/observability/audit'`** — Module augmentation that adds an `example` entry to the `AuditActionMap` interface, whose value is the union of all literal action strings above. No runtime code; purely a type-level registration.

## Relationships

- **`services/crud.ts`** and **`services/cover.ts`** — Downstream consumers. They import `exampleAuditActions` to tag the specific events they emit (CRUD operations → `created`/`updated`/`deleted`; cover changes → `cover_changed`).
- **`tests/integration/service.test.ts`** and **`tests/integration/capabilities.test.ts`** — Integration tests that assert the correct audit action is recorded after exercising the example services, relying on the augmented `AuditActionMap` for type-safe assertions.

## Notes

- This file contains **no runtime logic** beyond the `const` object; its primary effect is type-level (the `declare module` block).
- The pattern is deliberately per-module: each module augments the shared `AuditActionMap` independently. See `modules/account/audit.ts` as the canonical reference for why this augmentation approach was chosen.
- Action string values follow the `example.<past_tense_or_event>` convention. The `EXAMPLE_COVER_CHANGED` value uses `snake_case` for the compound suffix rather than the `CREATED`/`UPDATED`/`DELETED` pattern — a minor inconsistency worth noting if you are adding new actions.
- Audit-logging mechanics (winston transport, structured fields) live in `docs/tools/winston.md`, not here.
