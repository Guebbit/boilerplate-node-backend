---
source: src/modules/feedback/audit.ts
sha256: 9b9e3ecee7823fd05e8bf96f678d7c41faa2d3cfc1c80a7a8946411bd6255dd4
generated_at: 2026-09-23T18:39:00.930225+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/audit.ts

## Purpose

Declares the feedback module's audit-action vocabulary and registers it into the app-wide `AuditActionMap` via TypeScript module augmentation. Feedback rows carry a stranger's email address and free text, so *reads* (not just mutations) are audit-relevant here — a data-protection concern that does not apply to, e.g., the public product catalogue.

## Key elements

- **`feedbackAuditActions`** — A `const` object with three string-literal actions:
  - `ADMIN_FEEDBACK_VIEWED` (`'admin.feedback.viewed'`)
  - `ADMIN_FEEDBACK_STATUS_UPDATED` (`'admin.feedback.status_updated'`)
  - `ADMIN_FEEDBACK_DELETED` (`'admin.feedback.deleted'`)
- **`declare module '@infrastructure/observability/audit'`** — Augments the shared `AuditActionMap` interface with a `feedback` key whose type is the union of the values above, making all three actions type-safe across the app.

## Relationships

- **`src/modules/feedback/service.ts`** — Consumer of `feedbackAuditActions`; the service emits these action strings when recording audit events for viewing, status changes, and deletions.
- **`src/modules/feedback/tests/unit/audit.test.ts`** — Unit-tests the shape/values of `feedbackAuditActions` and the augmentation.
- **`src/modules/feedback/tests/integration/service.test.ts`** — Integration tests that exercise the service paths which fire these audit actions.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — Cross-cutting guard that verifies every module (including this one) has registered its actions into `AuditActionMap`.

## Notes

- Follows the same augmentation pattern as `modules/account/audit.ts`; see that file for the broader rationale if the local JSDoc is not enough.
- The action strings use dot-namespaced, lower_snake_case values (`admin.feedback.*`). Keep that convention if adding new actions.
- Because this file is a type-only declaration (no runtime exports beyond the `as const` object), bundlers will tree-shake it from any entry that only imports the types.
