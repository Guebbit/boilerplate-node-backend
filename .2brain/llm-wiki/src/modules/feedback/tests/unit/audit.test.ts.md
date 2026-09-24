---
source: src/modules/feedback/tests/unit/audit.test.ts
sha256: f954a4372d386195d9579faff6931fa75ae50852d5d0ac55ee957f5c8940f34c
generated_at: 2026-09-23T18:42:28.533453+00:00
model: ollama:qwen3.8:27b
---

# src/modules/feedback/tests/unit/audit.test.ts

## Purpose

Locks in the exact string values of the feedback module's audit action constants. These strings are a wire contract consumed by external log queries and alerts; a rename would pass type-checking but could silently break alerting. This test is the single owner of the value assertions—the cross-cutting suite only verifies the object's shape.

## Key elements

- **`describe('the feedback audit vocabulary')`** — groups the single value-pinning test.
- **`it('spells every action exactly as the log tooling expects')`** — asserts `feedbackAuditActions` deep-equals an object with three entries:
  - `ADMIN_FEEDBACK_VIEWED` → `'admin.feedback.viewed'`
  - `ADMIN_FEEDBACK_STATUS_UPDATED` → `'admin.feedback.status_updated'`
  - `ADMIN_FEEDBACK_DELETED` → `'admin.feedback.deleted'`

## Relationships

- **`src/modules/feedback/audit.ts`** — imports the `feedbackAuditActions` constant, which is the sole subject under test. No other dependencies.

## Notes

- The action strings are a **wire contract**, not just internal identifiers. Renaming a value (not the key) will not produce a TypeScript error in the importing module but will break downstream log queries and alerts.
- The doc block explicitly warns that the cross-cutting suite validates only the *shape* of the object; this file is responsible for pinning the *values*.
- Any addition of a new audit action to `audit.ts` requires a corresponding entry here or the test will fail on the next run.
