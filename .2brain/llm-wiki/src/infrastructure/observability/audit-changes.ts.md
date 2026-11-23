---
source: src/infrastructure/observability/audit-changes.ts
source_sha256: 8a102d010bb2e9f3492eeb50858a85f6ece82d807fe64eee7db9797fa35d1117
context_sha256: 95b2b9bcfb9f7996e7f5a4d288ecbf4c7e0baa2825034c574f46112ec1be18c0
generated_at: 2026-11-22T02:57:52.950556+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/audit-changes.ts

## Purpose
Builds the field-level diff stored in the `metadata` of an `*.updated` audit row. It is pure: it compares a stored record with the change-set about to be applied and knows nothing about who made the change or when. Because the audit collection is append-only and never scrubbed on erasure, fields are split into two lists so personal data never lands in it as a value.

## Key elements
- `FieldChange`: `{ from?, to? }`. An unset side is an absent key.
- `fieldChange(from, to)`: builds a `FieldChange` and omits any side that is `null` or `undefined`, because responses never carry `null`.
- `AuditChanges`: the result shape. It has an optional `changes` (a map of field to `FieldChange`) and an optional `changedFields` (a list of names).
- `AuditedFields<TKey>`: the allowlist.
  - `valued`: non-personal fields, recorded with old and new values.
  - `named`: free text, personal data and secrets, recorded by name only.
- `differs(before, after)`: compares `JSON.stringify(x ?? null)` of each side, so unset and `null` count as equal.
- `auditChanges(before, data, fields)`: the main function. A field counts as moved when `data[field] !== undefined` and it differs from the stored value. Moved `valued` fields go into `changes`. Moved `named` fields go into `changedFields`. It returns `{}` when nothing audited moved.

## Relationships
- Called by the service modules for delivery tracking, example CRUD, inventory admin, locale entries and languages, orders CRUD, products CRUD and webhook subscriptions. Each passes its own stored record, change-set and `AuditedFields` lists.
- `src/modules/users/services/audit-changes.ts` is a users-module neighbor of the same name, and it is related through the dependency graph.
- Covered by `tests/unit/infrastructure/observability/audit-changes.test.ts`.

## Notes
- A field in neither list is not audited at all, so a new field stays invisible until someone chooses a list for it. This allowlist is the privacy decision.
- Call `auditChanges` BEFORE assigning the change-set onto `before`. A hydrated document is updated in place, and the old value is lost afterwards.
- An absent key in `data` leaves the field alone, and `null` clears it. Sending an unchanged value writes nothing.
- The comparison is JSON-based, so it is sensitive to key order in objects and does not distinguish values that serialize identically.
