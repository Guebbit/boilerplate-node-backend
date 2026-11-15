---
source: src/infrastructure/observability/audit-changes.ts
sha256: 5043dab6cc525fc1483b1980f16a99bb69ac2920bae02229ed1e1a6a2c28e3ff
generated_at: 2026-11-14T18:11:12.477193+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/audit-changes.ts

## Purpose

Pure, side-effect-free module that computes the field-level diff stored in an `*.updated` audit row's `metadata`. Because the audit collection is append-only and never scrubbed on erasure, the diff is split into two lists at write time: `valued` fields carry `{ from, to }`, while `named` fields (free text, personal data, secrets) are recorded by name only. The allowlist passed in is the privacy boundary — a field appears in audit only if someone explicitly placed it in one of the two lists.

## Key elements

- **`FieldChange`** — interface for a single moved field: `{ from?: unknown; to?: unknown }`. An absent side means the key was not present.
- **`fieldChange(from, to)`** — builds a `FieldChange`, omitting any side that is `null` or `undefined` (responses never carry `null`).
- **`AuditChanges`** — the `metadata` shape written to the audit row: optional `changes` (valued map) and/or `changedFields` (named string array). Both keys are omitted entirely when empty.
- **`AuditedFields<TKey>`** — the per-module allowlist: `valued: readonly TKey[]` and `named: readonly TKey[]`.
- **`differs(before, after)`** — compares two values via `JSON.stringify(v ?? null)`; treats `undefined` and `null` as equivalent (both mean "absent").
- **`auditChanges(before, data, fields)`** — the main entry point. Walks the allowlist, checks which fields the change-set actually moves, and returns the assembled `AuditChanges` object (or `{}` if nothing audited moved).

## Relationships

- **Module service files** (`tracking.ts`, `crud.ts` in orders/products/example, `admin.ts`, `entries.ts`, `languages.ts`, `subscriptions.ts`) — each defines its own `AuditedFields` constant and calls `auditChanges` immediately before applying the change-set to the document, then stores the result as `metadata` on the audit row.
- **`src/modules/users/services/audit-changes.ts`** — a users-module-specific wrapper that supplies the users allowlist and delegates to this infrastructure function.
- **`tests/unit/infrastructure/observability/audit-changes.test.ts`** — unit tests covering `fieldChange`, `differs`, and `auditChanges` edge cases (empty change-sets, null/undefined handling, allowlist exclusion).

## Notes

- **Call order matters:** invoke `auditChanges` *before* assigning the change-set onto the hydrated document. Mongoose (or equivalent) updates in place, so the "before" values are destroyed once the assignment happens.
- **Allowlist is opt-in:** a field that is in neither `valued` nor `named` produces no audit entry. Adding a new persisted field is invisible to audit until a developer explicitly adds it to one list.
- **`differs` is shallow-structural:** it serializes via `JSON.stringify`, so key order in objects matters and `undefined` inside nested objects will be dropped. This is acceptable for the flat/scalar fields these modules audit.
- **`null` in the change-set is a deliberate clear**, not an absence — `moved()` treats `null` as a real value (it is not `undefined`), so clearing a field is audited.
