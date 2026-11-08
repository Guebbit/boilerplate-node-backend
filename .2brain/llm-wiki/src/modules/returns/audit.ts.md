---
source: src/modules/returns/audit.ts
sha256: 53bc4c6f01611339a4003268732eeec0ecc9e0de6df00e8be033b4e4bfcd6970
generated_at: 2026-11-08T07:55:24.160866+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/audit.ts

## Purpose

Declares the set of audit action strings the returns module emits and registers them in the infrastructure audit type map via module augmentation. It exists so that every audit log entry the returns domain produces is type-safe and discoverable from the infrastructure layer.

## Key elements

- **`returnsAuditActions`** — `as const` object mapping human-readable keys to the literal action strings (e.g. `ADMIN_RETURN_APPROVED` → `'admin.return.approved'`). The `admin.` prefix denotes actions only staff can trigger; `RETURN_REQUESTED` is the sole non-admin action.
- **Module augmentation of `@infrastructure/observability/audit`** — adds a `returns` key to `AuditActionMap` whose value type is the union of all action strings, giving callers compile-time checking of valid returns actions.

## Relationships

- **`services/decide.ts`**, **`services/receive.ts`**, **`services/close.ts`**, **`services/cancel.ts`** — each imports `returnsAuditActions` from this file to tag its audit log entry (approved/declined, received, closed, canceled respectively).
- **`controllers/get-return.ts`** — imports `ADMIN_RETURN_VIEWED` to record that staff opened a return's detail.
- **`tests/integration/service.test.ts`** — asserts the correct action string is emitted by the services above.
- **`@infrastructure/observability/audit`** (external) — the augmentation target; the returns action strings become part of the shared `AuditActionMap`.

## Notes

- The comment links to `modules/account/audit.ts` for the rationale: actions are declared per-module via augmentation rather than a single shared enum, keeping each domain's vocabulary local and the infrastructure map a union of all modules.
- `ADMIN_RETURN_CLOSED` and `ADMIN_RETURN_CANCELED` both carry an optional free-text note (the "why"), per their JSDoc comments.
- Because the object is `as const`, the inferred type is a union of literal strings — do not widen it when passing actions to the audit emitter.
