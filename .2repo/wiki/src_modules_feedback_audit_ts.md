# src/modules/feedback/audit.ts

## Purpose

Declares the feedback module's audit-action vocabulary and registers those actions into the application-wide `AuditActionMap` via TypeScript module augmentation. The file exists so that every admin read and write of feedback (which carries a stranger's email and free-text content) is recorded for data-protection compliance — a requirement the public product catalogue does not have.

## Key elements

- **`feedbackAuditActions`** (exported const) — the three action identifiers this module owns: `ADMIN_FEEDBACK_VIEWED`, `ADMIN_FEEDBACK_STATUS_UPDATED`, `ADMIN_FEEDBACK_DELETED`. Values are dot-namespaced strings (`admin.feedback.*`).
- **Module augmentation of `@infrastructure/observability/audit`** — adds a `feedback` key to the `AuditActionMap` interface, typed as the union of the values above. This makes the actions part of the global type surface so the audit infrastructure recognises them.

## Relationships

- **`src/modules/feedback/service.ts`** — the service that performs the viewed/status-updated/deleted operations; it references these action strings when emitting audit events.
- **`src/modules/feedback/tests/unit/audit.test.ts`** — unit-level tests that verify the augmentation and the action values.
- **`src/modules/feedback/tests/integration/service.test.ts`** — integration tests that assert the service emits the correct audit action on each operation.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — cross-cutting test that every module's actions are actually present in `AuditActionMap`, catching missed augmentations.

## Notes

- The augmentation pattern mirrors `modules/account/audit.ts`; both follow the same "declare actions locally, extend the global map" convention.
- Reads (`VIEWED`) are deliberately audited alongside mutations. The doc comment calls this out as a data-protection requirement specific to feedback (stranger email + free text), not a general rule.
- The `as const` on `feedbackAuditActions` is load-bearing: it gives the augmentation a literal-union type rather than a bare `string`.
