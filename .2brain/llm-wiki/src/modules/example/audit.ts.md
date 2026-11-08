---
source: src/modules/example/audit.ts
sha256: 4621e89ab73ab3ade54bd9e3eded8cfdebc48fb48345b46fdb1e288e26379f55
generated_at: 2026-11-08T05:47:57.207046+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/audit.ts

## Purpose

Declares the set of audit actions the example module can emit (create, update, status change, delete, cover change) and registers them into the app-wide `AuditActionMap` union via TypeScript module augmentation. The concrete values are generated from `rules.yaml` into `rules.generated`; this file's role is purely to widen the shared type so downstream consumers see this module's actions as a valid discriminant.

## Key elements

- **`exampleAuditActions`** (re-export from `./rules.generated`) — A const object whose keys are the audit action names for this module and whose values are the corresponding literal types. Sourced from `rules.yaml` at codegen time.
- **`declare module '@infrastructure/observability/audit'`** — Augments the global `AuditActionMap` interface so that `example` is a recognized action-family key. No runtime code is emitted; this is a type-level registration only.

## Relationships

- **`services/crud.ts`**, **`services/cover.ts`**, **`services/transition.ts`** — The runtime services that *emit* audit events tagged with the actions declared here (create/update/delete → crud, cover change → cover, status change → transition). This file supplies the type vocabulary they reference when logging.
- **`tests/integration/capabilities.test.ts`**, **`tests/integration/service.test.ts`** — Integration tests that exercise those services and therefore assert against the audit actions defined in this file.

## Notes

- The file is **type-only** in effect: the sole runtime artifact is the re-export of a generated const. No logic lives here.
- Adding a new auditable action requires editing `rules.yaml` and regenerating `rules.generated`; the augmentation line does not need manual updates because it references `keyof typeof exampleAuditActions`.
- The JSDoc points to `docs/tools/winston.md` for the broader audit-logging pipeline and to `modules/account/audit.ts` as a reference for the same augmentation pattern in another module.
