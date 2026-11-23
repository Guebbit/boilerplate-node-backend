---
source: src/kernel/staff-read.ts
source_sha256: 98663a443c3010d34a95ad321a888d753bd078695efe54833458a6d137523db5
context_sha256: ddfb8c195ac838b4b732799d4b02e51d4597e20dbb63cbf6eb5675bd15a20f36
generated_at: 2026-11-22T03:14:35.711686+00:00
model: claude-code:claude-sonnet-5-5
---

# src/kernel/staff-read.ts

## Purpose
Defines the audit entry for staff reading someone else's record (`admin.<resource>.viewed`). Customers reading their own data are not events; only callers holding the resource's wide-read staff rule are recorded, and not when the record is their own. It covers detail reads only, since a list would write one entry per page.

## Key elements
- **`StaffReadTarget`** (interface): describes one staff read.
  - `key`: the wide-read permission (`display:<Subject>` or `read:<Subject>`) that marks the caller as staff.
  - `action`: the `AuditAction` to record.
  - `targetType` and `targetId`: the resource kind and the record's id.
  - `subjectId` (optional): the person whose data the record holds. It is stored on the audit row so "who looked at my data" is a single query. It is absent for guest orders and other records that are not a person's.
- **`STAFF_READ_PURPOSES`** (const): maps each consultation action to a data-subject-readable purpose (e.g. `'admin.order.viewed'` → "handling your order"). The actions covered are order, user, return, task, invoice and credit_note. It also serves as the list of actions that count as a consultation, so a new `admin.<resource>.viewed` action must be added here or it never reaches the data-subject export. It is declared `as const satisfies Partial<Record<AuditAction, string>>`.
- **`recordStaffRead(request, target)`**: records the read via `recordAudit`, with outcome `'success'`. It is a no-op when:
  - there is no `request.caller`;
  - the caller does not hold `target.key` (checked with `heldRules`);
  - the caller is a session (no `credentialId`) reading their own record (`subjectId === caller.id`).

## Relationships
- `@kernel/ability` supplies `heldRules`, used to test whether the caller holds the staff key.
- `@kernel/permissions` supplies the `PermissionRuleId` type for `key`.
- `@infrastructure/http/request` supplies `callerContextOf`, which builds the audit context from the request.
- `@infrastructure/observability/audit` supplies `recordAudit` and the `AuditAction` type.
- The detail controllers call `recordStaffRead` after `getAuth`: get-order, get-return, get-task, get-user, get-order-invoice and get-order-credit-note.
- `src/modules/audit-logs/service.ts` is a graph neighbor. The `STAFF_READ_PURPOSES` doc comment ties it to the "who looked" export, but the file's content doesn't show how the service uses it.

## Notes
- An API key shares its minter's id, so it is not treated as "own". A key reading its minter's record is recorded; only sessions (`credentialId === undefined`) are exempt.
- The own-record check applies only when `subjectId` is provided.
- Don't call it from list endpoints.
