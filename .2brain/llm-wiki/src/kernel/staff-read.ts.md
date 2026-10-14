---
source: src/kernel/staff-read.ts
sha256: 8e4c618f8c49863ef0707c4c990f22c29355950d80c030e4ea70f6a5f67d9888
generated_at: 2026-10-14T08:24:43.740167+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/staff-read.ts

## Purpose

Provides a single audit-recording helper for the case where a staff member (holder of a resource's wide-read key, e.g. `orders.any.read`) reads **another** person's record. It exists to give a uniform, low-friction call site in detail-fetch controllers so that the `admin.<resource>.viewed` event is emitted consistently without each controller duplicating the "is this staff?" / "is this their own record?" checks.

## Key elements

- **`StaffReadTarget` (interface)** – Describes what was read: the permission `key` that identifies "staff" for the resource, the `AuditAction` to log, the `targetType` / `targetId`, and an optional `ownerId` used to suppress self-reads.
- **`recordStaffRead(request, target)` (function, exported)** – The sole call-site. Returns early (no-op) when the caller lacks `target.key` or when `target.ownerId` equals `caller.id`. Otherwise calls `recordAudit` with the caller context and a `success` outcome.

## Relationships

- **`src/kernel/ability.ts`** – Imports `heldKeys` to test whether the caller holds the wide-read key.
- **`src/infrastructure/http/request.ts`** – Imports `callerContextOf` to build the audit context from the Express `Request`.
- **`src/infrastructure/observability/audit.ts`** – Imports `recordAudit` and the `AuditAction` type; this file is the *consumer* of the audit sink.
- **`src/modules/invoicing/controllers/get-order-invoice.ts`**, **`src/modules/orders/controllers/get-order-item.ts`**, **`src/modules/returns/controllers/get-return-by-id.ts`**, **`src/modules/users/controllers/get-user-item.ts`** – Detail-fetch controllers that call `recordStaffRead` after the auth guard to emit the staff-viewed event.

## Notes

- **Detail reads only.** By design this helper is intended for single-record endpoints; list endpoints are expected *not* to call it, to avoid one audit entry per page.
- **`ownerId` is optional.** When the controller doesn't know the owner (e.g. a shared resource), omit `ownerId`; the self-read suppression is then skipped and the read is always recorded (provided the key check passes).
- **The function is deliberately side-effect-free for non-staff callers.** It never throws and never logs — it simply returns — so callers need no `if` guard around the call.
