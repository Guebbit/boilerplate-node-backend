# src/modules/feedback/audit.ts

## Purpose

Declares the audit-action vocabulary owned by the feedback module and registers it into the application-wide `AuditActionMap` via TypeScript module augmentation. Both reads and writes are audited because feedback rows contain a third party's email and free text, making "who viewed this" a data-protection concern that does not apply to, e.g., public product catalogue reads.

## Key elements

- **`feedbackAuditActions`** (const, exported) — Two audit action identifiers:
  - `ADMIN_FEEDBACK_VIEWED` (`'admin.feedback.viewed'`) — emitted when an admin views a feedback entry.
  - `ADMIN_FEEDBACK_STATUS_UPDATED` (`'admin.feedback.status_updated'`) — emitted when an admin changes a feedback entry's status.
- **Module augmentation of `@infrastructure/observability/audit`** — Adds a `feedback` key to the global `AuditActionMap` interface, typed as the union of the values in `feedbackAuditActions`. This lets the audit infrastructure type-check feedback actions without a circular import.

## Relationships

- **`src/modules/feedback/service.ts`** — Consumer side; the service layer performs the viewed / status-updated operations and references the `feedbackAuditActions` values when recording audit entries.
- **`src/modules/feedback/tests/unit/audit.test.ts`** — Unit tests for this file's exports and augmentation.

## Notes

- The augmentation pattern (declaring actions in the owning module, then extending the shared `AuditActionMap`) is the same convention used in `src/modules/account/audit.ts`. Follow it if adding new modules.
- Read actions are deliberately included. Do not remove `ADMIN_FEEDBACK_VIEWED` assuming only writes need auditing — it exists for data-protection compliance, not operational debugging.
- Action strings follow the `admin.<module>.<verb>` convention; keep new actions consistent with this shape.
