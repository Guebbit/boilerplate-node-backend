# src/modules/feedback/audit.ts

## Purpose

Declares the audit action strings for the feedback module and registers them into the shared `AuditActionMap` via TypeScript module augmentation. It exists so that feedback-related audit events are type-safe and scoped to this module, following the same per-module augmentation pattern used by `modules/account/audit.ts`.

## Key elements

- **`feedbackAuditActions`** (exported const) — Two action identifiers:
  - `ADMIN_FEEDBACK_VIEWED` (`'admin.feedback.viewed'`)
  - `ADMIN_FEEDBACK_STATUS_UPDATED` (`'admin.feedback.status_updated'`)
- **`declare module '@infrastructure/observability/audit'`** — Augments `AuditActionMap` with a `feedback` key typed as the union of the values above, making these actions available to the audit infrastructure with full literal-type safety.

## Relationships

- **`src/modules/feedback/service.ts`** — Consumer of the audit actions; the service layer references these constants when emitting audit events for admin feedback operations.
- **`src/modules/feedback/tests/unit/audit.test.ts`** — Unit tests covering this module's exports.

## Notes

- **Reads are audited here by design.** Feedback rows contain a customer's email address and free-form text submitted by the public, so *who* viewed them is a data-protection question. This is intentionally different from the product catalogue, where reads are public and auditing them would add no value.
- **Augmentation, not a shared enum.** The actions are declared per-module and merged into `AuditActionMap` rather than collected in one central enum. See `modules/account/audit.ts` for the rationale behind this pattern.
