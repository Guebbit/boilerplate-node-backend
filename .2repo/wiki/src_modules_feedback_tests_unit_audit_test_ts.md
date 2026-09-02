# src/modules/feedback/tests/unit/audit.test.ts

## Purpose
Pins the exact string values of the `feedbackAuditActions` object exported by the feedback audit module. These strings are a wire contract consumed by external log queries and alert rules; a rename would pass type-checking but silently stop alerts firing. This test acts as the single source-of-truth assertion on the *values*, not just the shape.

## Key elements
- **`describe('the feedback audit vocabulary')`** — groups the (single) assertion for clarity in reporter output.
- **`it('spells every action exactly as the log tooling expects')`** — asserts `feedbackAuditActions` equals an object with three keys (`ADMIN_FEEDBACK_VIEWED`, `ADMIN_FEEDBACK_STATUS_UPDATED`, `ADMIN_FEEDBACK_DELETED`) mapped to their dot- / underscore-delimited string values. Uses `toEqual` (deep equality) to lock both keys and values.

## Relationships
- **`src/modules/feedback/audit.ts`** — the sole import; provides the `feedbackAuditActions` constant whose values this test locks down. The test has no other imports or dependencies.

## Notes
- The file's own JSDoc states this test is the *owner* of the values: the cross-cutting integration suite only verifies the object's shape, not the specific strings. If you rename a string, this test is what will fail (or, worse, be forgotten).
- The three strings follow two naming patterns: `admin.feedback.viewed` (dot-separated) vs. `admin.feedback.status_updated` / `admin.feedback.deleted` (underscore for the action part). This inconsistency is intentional and locked in by the test.
