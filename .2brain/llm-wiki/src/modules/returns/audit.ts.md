---
source: src/modules/returns/audit.ts
sha256: e296abccaafc03d9e943004548f5df33a61ac7ec4cd7689586b36a7a676bb875
generated_at: 2026-11-14T21:32:02.709795+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/audit.ts

## Purpose

Declares the set of audit action strings the returns module emits and registers them into the shared `AuditActionMap` type via module augmentation, giving every returns service a single, type-safe vocabulary of audit events.

## Key elements

- **`returnsAuditActions`** — `as const` object of action strings (e.g. `admin.return.approved`, `return.requested`). Each key is the event name; each value is the wire-level string logged to the audit trail.
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — adds a `returns` key to `AuditActionMap` whose value is the union of all `returnsAuditActions` values, so downstream code can reference actions by type rather than by raw string.

## Relationships

- **`src/modules/returns/controllers/get-return.ts`** — emits `ADMIN_RETURN_VIEWED` when staff open a return detail.
- **`src/modules/returns/services/decide.ts`** — emits `ADMIN_RETURN_APPROVED` or `ADMIN_RETURN_DECLINED` on a staff decision.
- **`src/modules/returns/services/receive.ts`** — emits `ADMIN_RETURN_RECEIVED` when goods are confirmed received.
- **`src/modules/returns/services/proof.ts`** — emits `ADMIN_RETURN_PROOF_RECORDED` after carrier proof is stored.
- **`src/modules/returns/services/close.ts`** — emits `ADMIN_RETURN_CLOSED` for manual closure.
- **`src/modules/returns/services/cancel.ts`** — emits `ADMIN_RETURN_CANCELED` when an approved return is voided.
- **`src/modules/returns/services/outcome.ts`** — emits `RETURN_REQUESTED` when a customer initiates a return.
- **`src/modules/returns/tests/integration/service.test.ts`** — asserts the correct audit action is recorded for each service flow.

## Notes

- Actions prefixed `admin.` are staff-only; the single non-prefixed action (`return.requested`) is customer-initiated.
- The file intentionally uses a local `as const` object + module augmentation rather than a shared enum, matching the pattern in `modules/account/audit.ts` (per the header comment).
- Because of `as const`, the union type of all action strings is derived automatically—adding a new key to the object is the only step needed to widen `AuditActionMap['returns']`.
