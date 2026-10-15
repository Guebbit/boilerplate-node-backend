---
source: src/modules/inventory/services/admin.ts
sha256: 078cf2d2cdb31aae2d9956bc97b2fc1b13d64764e24a78df599c13bd312e80af
generated_at: 2026-10-15T10:35:41.904049+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/admin.ts

## Purpose

Operator-facing stock writes: receiving supplier deliveries, applying stocktake corrections, and setting preorder limits. Exists to centralize the "back-office" mutations that change inventory counters, each with its own audit trail and failure semantics, while delegating the actual row-level math to the shared `transition` and `allocate` services.

## Key elements

- **`receive(productId, quantity, note?, context?)`** — exported. Records a delivery (positive quantity), then atomically allocates the incoming units to paid preorders (oldest payment first). Returns the fresh `InventoryLevel` or 404 if the product is unknown.
- **`adjust(productId, delta, note?, context?)`** — exported. Applies a signed stocktake correction. Refuses with 409 if the result would fall below the current `reserved` count; 404 if the product doesn't exist. Never allocates.
- **`setPreorderLimit(productId, preorderLimit, context?)`** — exported. Updates the preorder allowance for a product. Does **not** write a ledger row (no stock movement); audited under `ADMIN_PREORDER_LIMIT_SET`.
- **`AdminStockTransition`** (interface) — shared parameter bag that lets `receive` and `adjust` differ only in `reason`, `onFailure`, `allocates`, `auditAction`, `buildAuditMetadata`, and `successMessageKey`.
- **`applyAdminStockTransition`** (private) — common implementation: validates product existence → applies transition (or `receiveAndAllocate`) → reads back the level → audits → returns success/reject.
- **`receiveAndAllocate`** (private) — wraps `applyTransition` + `allocateWithin` in a single DB transaction; after commit, nudges the outbox relay and syncs the stock cache.
- **`levelFor`** (private) — reads the product's `InventoryLevel` row and shapes it into the response DTO (or `null` if no row exists).

## Relationships

| Neighbor | Interaction |
|---|---|
| `modules/inventory/services/transition.ts` | Calls `applyTransition` (row-level counter math) and `syncStockCache` (post-commit cache refresh). |
| `modules/inventory/services/allocate.ts` | Calls `allocateWithin` to assign incoming units to waiting preorders inside the same transaction. |
| `modules/inventory/repository.ts` | Uses `stockLevelRepository.findByProductId` and `.setPreorderLimit` for direct reads/writes. |
| `modules/inventory/audit.ts` | Reads `inventoryAuditActions` enum values to tag each audit record. |
| `modules/products/index.ts` | Calls `productService.findByIdRaw` to verify product existence and retrieve the title. |
| `infrastructure/http/response.ts` | Uses `generateSuccess` / `generateReject` to shape HTTP responses. |
| `infrastructure/i18n/index.ts` | Uses `t()` for all user-facing message strings. |
| `infrastructure/observability/audit.ts` | Calls `recordAudit` after every successful write. |
| `infrastructure/runtime/database.ts` | Uses `withTransaction` to guarantee receive + allocate are atomic. |
| `kernel/outbox.ts` | Calls `nudgeOutbox()` after a delivery commits to wake the relay. |
| `services/index.ts` | Re-exports the three public functions. |
| `tests/integration/*.test.ts` | Exercises `receive`, `adjust`, and `setPreorderLimit` end-to-end (cache invalidation, preorder allocation, general service behavior). |

## Notes

- **Existence check is pre-write.** `applyAdminStockTransition` calls `productService.findByIdRaw` *before* touching the level row. This prevents creating an orphan level row + ledger entry for an unknown product (especially relevant for `receive`, whose transition guard accepts any row).
- **`adjust` disambiguates 404 vs 409 via re-read.** The transition guard covers both "product missing" and "would go below reserved." The `onFailure` callback re-queries the product to report the correct status code.
- **Only `receive` touches the outbox and stock cache.** `adjust` and `setPreorderLimit` do not call `nudgeOutbox()` or `syncStockCache()`—they leave cache coherence to the caller or a subsequent event.
- **`setPreorderLimit` is not a stock movement.** It writes no ledger row; lowering the limit below outstanding preorders is explicitly allowed (existing orders stand, only new ones are blocked).
- **`context` is optional everywhere.** Omitted in tests to skip audit emission; production callers pass it through from the HTTP request scope.
