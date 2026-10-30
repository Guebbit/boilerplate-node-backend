---
source: src/infrastructure/observability/audit-changes.ts
sha256: 3bfcc9be1084f2864834c2c2399f7e0e3aef92232cb1c597a5e89dd30dbf89cb
generated_at: 2026-10-29T02:09:00.744885+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/audit-changes.ts

## Purpose

Pure utility that computes the field-level diff carried in the `metadata` of an `*.updated` audit row. It compares a stored record against an incoming change-set and classifies moved fields into two privacy tiers: `valued` (non-personal, recorded as `{ from, to }`) and `named` (personal data / secrets, recorded by name only). It says nothing about who, when, or where — only *what* changed.

## Key elements

- **`FieldChange`** (interface) — shape of one moved field: optional `from` and `to`.
- **`fieldChange(from, to)`** — builds a `FieldChange`, omitting either side when it is `null`/`undefined` (convention: responses never carry `null`).
- **`AuditChanges`** (interface) — the `metadata` payload for an audit row: optional `changes` (valued diffs) and optional `changedFields` (named list).
- **`AuditedFields<TKey>`** (interface) — the per-module allowlist: `valued: readonly TKey[]` and `named: readonly TKey[]`.
- **`auditChanges<TKey>(before, data, fields)`** — main entry point. Walks the allowlist, returns `AuditChanges` with only the fields that actually moved. Returns `{}` when nothing audited changed.
- **`differs(before, after)`** (module-private) — deep-ish equality check via `JSON.stringify`, treating `null` and `undefined` as equivalent.

## Relationships

- **Consumed by** `src/modules/users/services/audit-changes.ts`, `src/modules/orders/services/crud.ts`, `src/modules/products/services/crud.ts`, `src/modules/delivery/services/tracking.ts`, `src/modules/inventory/services/admin.ts`, `src/modules/locales/services/entries.ts`, `src/modules/locales/services/languages.ts`, `src/modules/webhooks/services/subscriptions.ts` — each service calls `auditChanges` (or its thin wrapper) to build the `metadata` it writes alongside the audit row.
- **Tested by** `tests/unit/infrastructure/observability/audit-changes.test.ts`.
- This module has **no outgoing dependencies**; it is a leaf node (imports only from the type system).

## Notes

- **Call before mutation.** Hydrated documents are updated in place; once the change-set is assigned onto `before`, the old values are gone. `auditChanges` must be invoked *before* the assignment.
- **Allowlist is the privacy decision.** A field not present in either `valued` or `named` is silently untracked. Adding a new field requires an explicit choice of tier.
- **`differs` uses `JSON.stringify`.** Non-serialisable values (functions, `Map`, circular refs) will not compare correctly — a practical limitation given the "unknown" type signatures.
- **Empty result is `{}`**, not `{ changes: {}, changedFields: [] }`. Consumers checking for "no diff" should test for the absence of keys rather than array length.
