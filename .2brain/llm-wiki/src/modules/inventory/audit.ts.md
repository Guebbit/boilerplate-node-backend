---
source: src/modules/inventory/audit.ts
sha256: 9064b670ff6f14a1457fb5bcffad4b1b793e9fb3eb5eb0da21a035ff5e48ad44
generated_at: 2026-09-23T18:43:19.636343+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/audit.ts

## Purpose

Defines the inventory module's audit action vocabulary and registers it into the application-wide `AuditActionMap` type. The four actions cover admin-level stock operations and one module-owned invariant-failure case (`ADMIN_COMMIT_ORPHANED`) that cannot be attributed to a caller's lifecycle audit.

## Key elements

- **`inventoryAuditActions`** — A `const` object with four dot-namespaced action strings:
  - `admin.stock.received` — stock received by an admin.
  - `admin.stock.adjusted` — admin-initiated stock level adjustment.
  - `admin.reservations.swept` — batch expiration/sweep of stale reservations.
  - `admin.commit.orphaned` — `commitForOrder` found no matching hold to claim (module invariant failure, audited here rather than by the caller).
- **`declare module '@infrastructure/observability/audit'`** — Module augmentation that adds an `inventory` key to the global `AuditActionMap` interface, typed as the union of `inventoryAuditActions` values. This follows the same augmentation-over-shared-enum pattern used in `modules/account/audit.ts`.

## Relationships

- **`src/modules/inventory/service.ts`** — The service that performs the operations these actions name (stock receive/adjust, reservation sweep, commit) and emits the corresponding audit events. `ADMIN_COMMIT_ORPHANED` is the one action the service emits on a code path it considers a local invariant breach rather than a caller-attributable lifecycle transition.
- **`src/modules/inventory/tests/integration/service.test.ts`** — Integration tests that exercise the service's audit-emission behavior, including the orphaned-commit path.

## Notes

- `ADMIN_COMMIT_ORPHANED` is deliberately audited by this module's service rather than by the calling order/payment module, because no external "owner" event exists for a hold that was never placed. The other three actions are admin-initiated and are not side effects of a checkout/payment/cancellation flow.
- The augmentation pattern (per-module `declare module` block) is intentional: it avoids a central enum and keeps each module's action set self-contained. Do not consolidate these into a shared constants file without mirroring the `modules/account/audit.ts` rationale.
