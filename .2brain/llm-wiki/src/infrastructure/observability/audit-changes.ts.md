---
source: src/infrastructure/observability/audit-changes.ts
sha256: 3bfcc9be1084f2864834c2c2399f7e0e3aef92232cb1c597a5e89dd30dbf89cb
generated_at: 2026-11-08T03:38:52.221810+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/audit-changes.ts

## Purpose

Pure helper that computes the field-level diff an `*.updated` audit row stores in its `metadata`. It compares a stored record against an incoming change-set and emits a two-tier summary (`changes` for non-personal values, `changedFields` for personal/named fields). It carries no identity, timestamp, or side-effect — callers supply the context.

## Key elements

- **`FieldChange`** — `{ from?, to? }`; one side is omitted when the value was absent.
- **`fieldChange(from, to)`** — factory for `FieldChange`; drops `null`/`undefined` sides so the payload never carries an empty value (per the API empty-null convention).
- **`AuditChanges`** — the metadata shape: optional `changes` record and optional `changedFields` string array. Both keys are omitted entirely when empty.
- **`AuditedFields<TKey>`** — caller-supplied allowlist splitting fields into `valued` (record old/new) and `named` (record name only).
- **`differs(before, after)`** *(private)* — treats `undefined` and `null` as equivalent via `JSON.stringify(x ?? null)`; returns `true` when the two sides represent different values.
- **`auditChanges(before, data, fields)`** — main export. Walks the allowlist, detects moved fields, and returns a populated `AuditChanges` (or `{}`).

## Relationships

- **Domain services** (`delivery/tracking`, `example/crud`, `inventory/admin`, `locales/entries`, `locales/languages`, `orders/crud`, `products/crud`, `webhooks/subscriptions`) each call `auditChanges` with their own `AuditedFields` allowlist to build the `metadata` payload for their `*.updated` audit rows.
- **`src/modules/users/services/audit-changes.ts`** — module-level wrapper that likely selects the user-specific field allowlist before delegating to this infrastructure function.
- **`tests/unit/infrastructure/observability/audit-changes.test.ts`** — unit tests covering the diff logic, null/undefined equivalence, and empty-result behavior.

## Notes

- **Call before mutation.** The change-set is applied in place to the hydrated document; once `data` is written onto `before`, the original values are lost. Always invoke `auditChanges` first.
- **Allowlist = privacy decision.** A field not present in either `valued` or `named` is silently un-audited. Adding a new persisted field does nothing until someone explicitly places it on one of the two lists.
- **Comparison is `JSON.stringify`-based.** This means structurally equal objects compare as equal, but key-order differences in nested objects would not (unlikely in practice given the scalar fields typically audited).
- **Append-only audit log.** The metadata is written once and never scrubbed on erasure — another reason `named` fields store only the field name, never the value.
