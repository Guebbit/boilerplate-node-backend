---
source: src/kernel/staff-read.ts
sha256: 3a2a4647285e91d11716623945594881cbb2c9d336c6cd52af2adad95f98d2cd
generated_at: 2026-10-29T02:21:04.218159+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/staff-read.ts

## Purpose

Records a single audit entry (`admin.<resource>.viewed`) when a staff member reads another person's record via a detail endpoint. It deliberately does **not** fire for a customer reading their own record or for list/page reads, so the log captures only the entry that names a specific record by a caller who is "staff" for that resource.

## Key elements

- **`StaffReadTarget`** (interface) — bundles the wide-read permission key (e.g. `display:Order`), the `AuditAction` to write, the resource type/id, and an optional `ownerId` used for the self-read guard.
- **`recordStaffRead(request, target)`** (function, main export) — returns early if the caller is missing, lacks the target's wide-read key in their held rules, or the record belongs to the caller. Otherwise delegates to `recordAudit` with a fixed `outcome: 'success'`.

## Relationships

- **`src/kernel/ability.ts`** — provides `heldRules(caller)` used to check whether the caller holds the target's wide-read permission key.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf(request)` to extract the caller's identity/context for the audit record.
- **`src/infrastructure/observability/audit.ts`** — provides `recordAudit` (the audit sink) and the `AuditAction` type.
- **Controllers** (`get-order-item.ts`, `get-order-invoice.ts`, `get-order-credit-note.ts`, `get-return-by-id.ts`, `get-ticket-by-id.ts`, `get-user-item.ts`) — each calls `recordStaffRead` after fetching a detail record, passing the resource-specific key, action, type, id, and owner id.

## Notes

- Only detail reads are audited; list/page endpoints intentionally do **not** call this function to avoid one entry per page.
- `ownerId` is optional: when omitted the self-read guard is skipped, so the entry is always written (provided the key check passes).
- The function is fire-and-forget (`void` return); it does not throw and does not alter the response.
- Module docs point to `docs/theory/defences/authentication.md` for the broader "staff vs. owner" access model.
