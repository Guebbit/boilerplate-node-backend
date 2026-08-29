# src/modules/inventory/audit.ts

## Purpose

Declares the set of auditable admin actions for the inventory module and registers them in the global audit type map via module augmentation. It exists so that every human-initiated stock change is recorded with a stable, typed action name, while deliberately excluding system-driven lifecycle transitions (reserve, commit, release, expire) that are already audited at their originating request.

## Key elements

- **`inventoryAuditActions`** — A `const` object of three string-literal action IDs:
  - `ADMIN_STOCK_RECEIVED` (`admin.stock.received`) — stock was received into the warehouse.
  - `ADMIN_STOCK_ADJUSTED` (`admin.stock.adjusted`) — a stocktake correction; the audit row captures which admin, how many units, and the stated reason.
  - `ADMIN_RESERVATIONS_SWEPT` (`admin.reservations.swept`) — an admin-initiated sweep of stale reservations.
- **Module augmentation** (`declare module '@infrastructure/observability/audit'`) — Adds an `inventory` key to the `AuditActionMap` interface, typed as the union of `inventoryAuditActions` values. This is the mechanism that makes the action strings type-safe at every call site without a shared enum.

## Relationships

- **`src/modules/inventory/service.ts`** — Consumer. The service imports `inventoryAuditActions` and emits the corresponding audit entries when an admin performs a stock receive, adjustment, or reservation sweep.
- **`@infrastructure/observability/audit`** — Augmented target. This file extends its `AuditActionMap` interface; no runtime import is present, only the type-level `declare module`.
- **`src/modules/account/audit.ts`** — Cited in the header comment as the reference for *why* augmentation (rather than a shared enum) is the chosen pattern.

## Notes

- The exclusion of lifecycle transitions is intentional and documented in the header comment: those events are audited by whichever request (checkout, payment, cancellation) caused them, and re-auditing them here would record the same fact twice under different vocabulary.
- `ADMIN_STOCK_ADJUSTED` is called out as the highest-value audit row (shrinkage/correction tracking); treat it as the primary source for reconciliation queries.
- Because the values are `as const`, adding a new action requires updating both the object literal and any exhaustive switches downstream — the augmentation keeps the type system enforcing that.
