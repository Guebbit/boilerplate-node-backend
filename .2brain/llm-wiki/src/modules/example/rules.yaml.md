---
source: src/modules/example/rules.yaml
sha256: 2a50cb882629886d863a7630fefa0a9e6d9f26dbd481746839582e88de68e11b
generated_at: 2026-11-08T05:52:43.289698+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/rules.yaml

## Purpose

Declarative registry of audit and analytics event names for the example module. It is the single source of truth from which `npm run regenerate` emits `rules.generated.ts`, providing strongly-typed constant strings for the app-wide `AuditActionMap` and `AnalyticsEventMap` unions.

## Key elements

- **`audit`** — List of `{ value, description }` entries for every auditable action on an example entity (created, updated, status_changed, deleted, cover_changed).
- **`analytics`** — List of `{ value, description }` entries for analytics events (currently `example_published`).
- **Naming convention (auto-derived)** — The generated constant key is the `value` uppercased with `.` replaced by `_` (e.g. `example.created` → `EXAMPLE_CREATED`).

## Relationships

- **`src/modules/example/openapi.yaml`** — Sibling module configuration. The audit event values correspond to the API operations (create, update, status-change, delete, cover-set) declared in the OpenAPI spec; both files are consumed together when onboarding a new example-module action.

## Notes

- **Not read at runtime.** The YAML is consumed only by the codegen step (`npm run regenerate`). Importing the list directly at boot would widen the union to `string`; the generated TS constants preserve literal types.
- **Adding a new event** requires editing this file *and* running the regenerate script before the new key is usable in TypeScript.
