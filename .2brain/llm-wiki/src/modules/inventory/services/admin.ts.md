---
source: src/modules/inventory/services/admin.ts
sha256: 9ea735bb2a62d579ecff431b1d1853b5d803798f0100627eb1ee23a27a379d9c
generated_at: 2026-11-08T06:01:40.596307+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/admin.ts

## Purpose

Operator-facing stock write operations for the inventory domain: recording incoming deliveries (`receive`), applying signed stocktake corrections (`adjust`), and managing the backorder allowance (`setBackorderLimit`). Each write is audited, atomically applied, and returns the product's counters so the caller can render the post-write state.

## Key elements

- **`receive`** (exported) — Records a positive quantity arriving from a supplier. Atomically applies the transition *and* allocates the units to the oldest paid preorders in one transaction. Fails with 404 if the product does not exist.
- **`adjust`** (exported) — Applies a signed stocktake delta. Allocates only when the delta is positive (newly found units go to waiting buyers). On failure, re-reads the product to distinguish 404 (product missing) from 409 (would drop below reserved).
- **`setBackorderLimit`** (exported) — Sets or clears the per-product backorder cap. Not a stock movement (no ledger row); audits the field diff via `auditChanges`. Lowering below outstanding orders is permitted.
- **`applyAdminStockTransition`** (internal) — Shared body for `receive` and `adjust`: product-existence check → apply (with optional allocation) → read-back → audit → response. Parameterized by the `AdminStockTransition` interface.
- **`receiveAndAllocate`** (internal) — Wraps `applyTransition` + `allocateWithin` in a single `withTransaction`, then nudges the outbox and refreshes the stock cache *after* commit.
- **`levelFor`** (internal) — Reads a product's `InventoryLevel` from the repository and runs it through `presentInventoryLevel`.
- **`AdminStockTransition`** (interface) — Describes what each caller supplies to the shared body: reason, signed/unsigned amount, failure handler, allocation flag, audit action, and metadata builder.

## Relationships

- **`src/modules/inventory/services/transition.ts`** — Calls `applyTransition` (the state-machine guard + ledger write) and `refreshStockCache` (catalogue sync).
- **`src/modules/inventory/services/allocate.ts`** — Calls `allocateWithin` to distribute newly available units to paid preorders within the same transaction.
- **`src/modules/inventory/repository.ts`** — Reads/writes `stockLevelRepository` for level lookups and `setBackorderLimit`.
- **`src/modules/inventory/presenter.ts`** — Transforms a raw `InventoryLevel` row into the API shape via `presentInventoryLevel`.
- **`src/modules/inventory/audit.ts`** — Supplies `inventoryAuditActions` enum values used in `recordAudit` calls.
- **`src/modules/products/index.ts`** — Uses `productService.findByIdRaw` for the pre-write existence check and, in `adjust`'s failure path, the 404-vs-409 disambiguation read.
- **`src/kernel/outbox.ts`** — Calls `nudgeOutbox` after a successful receive/allocate commit so the relay wakes for downstream side-effects.
- **`src/infrastructure/runtime/database.ts`** — Uses `withTransaction` to scope the transition + allocation into one atomic unit.
- **`src/infrastructure/http/response.ts`** — Builds `ResponseSuccess` / `ResponseReject` payloads.
- **`src/infrastructure/i18n/index.ts`** — Calls `t()` for user-facing error messages.
- **`src/infrastructure/observability/audit.ts`** — Calls `recordAudit` to log each successful write.
- **`src/infrastructure/observability/audit-changes.ts`** — Calls `auditChanges` to compute the backorder-limit diff metadata.
- **`src/modules/inventory/services/index.ts`** — Barrel file that re-exports this module's public API.

## Notes

- **Outbox & cache refresh are post-commit.** `nudgeOutbox` and `refreshStockCache` run in the `.then` chain after `withTransaction` resolves, so they cannot roll back with the write.
- **Product existence is checked before the write.** Because `applyTransition`'s `receive` guard would create a level row even for a missing product, the explicit `productService.findByIdRaw` call prevents orphan rows and ledger entries.
- **`adjust`'s 409 path re-reads the product.** The transition guard rejects both "product missing" and "below reserved" with a single `false`; the `onFailure` callback issues a second read to map the outcome to the correct status code.
- **`setBackorderLimit` is audited but not a ledger write.** It changes a policy field on the level row, not `onHand`/`reserved`; hence `auditChanges` (field diff) instead of the transition-based `recordAudit`.
- **`context` is required for `receive`/`adjust`** (a stock write with no accountable caller is untraceable) but **optional for `setBackorderLimit`** (tests omit it to skip the audit emit).
