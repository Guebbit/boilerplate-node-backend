---
source: tests/unit/infrastructure/observability/audit-changes.test.ts
sha256: ef69c86cf0a9ee554bfd4dc1135f42ac954aaf1844d1ce2a268b4722de5e32ab
generated_at: 2026-11-08T10:20:29.834123+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/observability/audit-changes.test.ts

## Purpose

Unit tests for the `auditChanges` and `fieldChange` helpers that build the audit-trail row describing which fields an update moved. The tests pin down the contractual distinction between *valued* fields (record `from`/`to` values) and *named* fields (record only the field name, never the value).

## Key elements

- **`FIELDS` constant** — test fixture defining the schema under test: valued fields `['count', 'labels']`, named field `['note']`.
- **`describe('auditChanges')`** — 7 cases covering:
  - Valued field change → `{ changes: { field: { from, to } } }`
  - Named field change → `{ changedFields: ['note'] }`, value never appears in output
  - Empty or unchanged updates → `{}`
  - List order change treated as a change (content-equal but reordered)
  - `null` ≡ `undefined` (both mean "unset"); clearing a named field records `changedFields` with no value
  - Unset side of a valued field is omitted, not serialized as `null`
  - Clearing a valued field yields `{ from }` with no `to`
- **`describe('fieldChange')`** — 2 cases for the low-level side-pairing helper:
  - Both sides set (including falsy `0`, `false`) → both kept
  - Either side `null`/`undefined` → that side dropped; both unset → `{}`

## Relationships

- **`src/infrastructure/observability/audit-changes.ts`** — sole import source. The test file exercises `auditChanges` (the public API) and `fieldChange` (the internal helper) exported from that module.

## Notes

- The privacy guarantee for *named* fields (value must never appear in serialized output) is asserted via `JSON.stringify(result).not.toContain('text')` — a string-match check rather than structural inspection. Treat this as the security boundary test.
- `null` and `undefined` are intentionally interchangeable in input; tests assert they produce identical results. Do not introduce a distinction between them without updating these cases.
- List comparison is order-sensitive (`['a','b']` vs `['b','a']` is a change), not set-equality.
