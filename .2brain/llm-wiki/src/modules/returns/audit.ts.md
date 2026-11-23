---
source: src/modules/returns/audit.ts
source_sha256: e296abccaafc03d9e943004548f5df33a61ac7ec4cd7689586b36a7a676bb875
context_sha256: 440ef8124033b7f5ea0297a162da23e4f40ed845ede8dae32419553f1db45a04
generated_at: 2026-11-22T07:20:50.691041+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/audit.ts

## Purpose
Declares the audit action strings the returns module emits and registers them with infrastructure's audit action map via TypeScript module augmentation. The augmentation approach (rather than a shared enum) is explained in `src/modules/account/audit.ts`. The `admin.` prefix marks actions only staff can perform.

## Key elements
- `returnsAuditActions` — `as const` object mapping event keys to action strings:
  - `RETURN_REQUESTED` → `return.requested`
  - `ADMIN_RETURN_VIEWED` → `admin.return.viewed` (staff opened a return's detail)
  - `ADMIN_RETURN_APPROVED` → `admin.return.approved`
  - `ADMIN_RETURN_DECLINED` → `admin.return.declined`
  - `ADMIN_RETURN_RECEIVED` → `admin.return.received`
  - `ADMIN_RETURN_PROOF_RECORDED` → `admin.return.proof_recorded` (carrier's proof of sending recorded for an approved return)
  - `ADMIN_RETURN_CLOSED` → `admin.return.closed` (received return closed by hand, optional note)
  - `ADMIN_RETURN_CANCELED` → `admin.return.canceled` (approved return whose goods never came canceled, optional note)
- `declare module '@infrastructure/observability/audit'` — adds a `returns` entry to `AuditActionMap`, typed as the union of the values of `returnsAuditActions`.

## Relationships
- The neighbors listed are the places that fire or check these actions: `src/modules/returns/controllers/get-return.ts` (viewing a return), and the services `src/modules/returns/services/cancel.ts`, `src/modules/returns/services/close.ts`, `src/modules/returns/services/decide.ts` (approve/decline), `src/modules/returns/services/outcome.ts`, `src/modules/returns/services/proof.ts`, and `src/modules/returns/services/receive.ts`, each matching an action above by name. This is inferred from naming; the file itself contains no imports or callers.
- `src/modules/returns/tests/integration/service.test.ts` is a related test neighbor.
- Augments `@infrastructure/observability/audit` so these strings are valid audit actions.

## Notes
- Only `RETURN_REQUESTED` lacks the `admin.` prefix; every other action is staff-only.
- The file contains no runtime logic beyond the constant; the module augmentation is type-level only.
