---
source: src/modules/returns/audit.ts
sha256: 9a0fc8f72cb8b5d8517e5ed2454379c3d7f278fc59b095c3a26dd7f6e50f2b52
generated_at: 2026-10-15T11:50:53.143193+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/audit.ts

## Purpose
Declares the set of audit action strings that the returns module can emit and registers them into the global audit action map via TypeScript module augmentation. This centralises the action identifiers so that services and controllers fire consistent, type-safe audit events without re-declaring the strings.

## Key elements
- **`returnsAuditActions`** — A `const` object of five action strings, keyed by event:
  - `ADMIN_RETURN_VIEWED` — staff opened a return's detail view
  - `RETURN_REQUESTED` — a customer initiated a return
  - `ADMIN_RETURN_APPROVED` — staff approved the return
  - `ADMIN_RETURN_DECLINED` — staff declined the return
  - `ADMIN_RETURN_RECEIVED` — staff marked the return as physically received
- **`declare module '@infrastructure/observability/audit'`** — Augments `AuditActionMap` with a `returns` property typed as the union of all values in `returnsAuditActions`, making the actions available to the shared audit/logging infrastructure.

## Relationships
- **`services/receive.ts`** — Emits `ADMIN_RETURN_RECEIVED` when a return is marked received.
- **`services/decide.ts`** — Emits `ADMIN_RETURN_APPROVED` or `ADMIN_RETURN_DECLINED` depending on the staff decision.
- **`controllers/get-return-by-id.ts`** — Emits `ADMIN_RETURN_VIEWED` when staff open a return's detail page.
- **`tests/integration/service.test.ts`** — Asserts that the expected audit actions are fired by the services listed above.
- All of the above import `returnsAuditActions` (or rely on the augmented `AuditActionMap`) to keep action strings consistent.

## Notes
- Actions prefixed with `admin.` are restricted to staff-only flows; the `RETURN_REQUESTED` action (no `admin.` prefix) is the sole customer-facing event.
- The augmentation pattern (rather than a shared enum) mirrors the convention established in `modules/account/audit.ts`; each module owns its own action namespace to avoid cross-module coupling.
- The `as const` on `returnsAuditActions` is what gives the augmentation a literal-union type; removing it would widen `AuditActionMap['returns']` to `string`.
