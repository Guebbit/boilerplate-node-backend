---
source: src/modules/inventory/services/admin.ts
sha256: cce89bcd88cc0bcc92339b7b00d6ca55b792801b29b9a6a919eb89a3dc84c990
generated_at: 2026-10-14T15:56:52.697854+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/services/admin.ts

## Purpose

Service layer for operator-initiated stock writes: receiving deliveries, applying stocktake corrections, and setting preorder limits. Encapsulates the shared validation, audit, and response-shaping logic so that `receive` and `adjust` (and the distinct `setPreorderLimit`) stay small and consistent.

## Key elements

- **`levelFor(productId)`** — Reads back the stock counters (`onHand`, `reserved`, `available`, `preorderLimit`, `preordered`) joined with the product title. Returns `null` if the level row or product is missing.
- **`receiveAndAllocate(productId, quantity, note)`** — Wraps `applyTransition` (reason `receive`) and `allocateWithin` in a single `withTransaction`. After commit, calls `nudgeOutbox()` and `syncStockCache`.
- **`AdminStockTransition`** (interface) — Config object that parameterises the shared transition body (reason, amount, audit action, failure handler, whether to allocate, i18n key, etc.).
- **`applyAdminStockTransition(config)`** — Shared body: verifies the product exists, delegates the write (plain or transactional-with-allocation), reads back the level, records audit, and builds the success/reject response.
- **`receive(productId, quantity, note?, context?)`** *(exported)* — Records an inbound delivery; always allocates to waiting preorders; refusal means the product is unknown (404).
- **`adjust(productId, delta, note?, context?)`** *(exported)* — Applies a signed stocktake correction; refuses (409) if the result would drop below `reserved`. Re-reads the product on failure to disambiguate 404 vs 409.
- **`setPreorderLimit(productId, preorderLimit, context?)`** *(exported)* — Sets the preorder allowance directly via `stockLevelRepository.setPreorderLimit`. Does **not** write a ledger row; only emits an audit event.

## Relationships

- **`src/infrastructure/runtime/database.ts`** — `withTransaction` wraps `receiveAndAllocate` so the receive + allocate steps are atomic.
- **`src/modules/inventory/services/transition.ts`** — `applyTransition` performs the actual signed counter update; `syncStockCache` is called post-commit to invalidate the read-through cache.
- **`src/modules/inventory/services/allocate.ts`** — `allocateWithin` moves reserved units to waiting preorders inside the same transaction as the receive.
- **`src/modules/inventory/repository.ts`** — `stockLevelRepository` provides `findByProductId` and `setPreorderLimit`.
- **`src/modules/products/index.ts`** — `productService.findByIdRaw` is used for existence checks and to fetch the product title.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` emits a structured audit event after each successful write.
- **`src/modules/inventory/audit.ts`** — `inventoryAuditActions` supplies the typed action identifiers (`ADMIN_STOCK_RECEIVED`, `ADMIN_STOCK_ADJUSTED`, `ADMIN_PREORDER_LIMIT_SET`).
- **`src/kernel/outbox.ts`** — `nudgeOutbox` wakes the outbox relay after a successful receive so downstream consumers are notified.
- **`src/infrastructure/http/response.ts`** — `generateSuccess` / `generateReject` shape the API response envelope.
- **`src/infrastructure/i18n/index.ts`** — `t` resolves user-facing success and error messages.
- **`src/modules/inventory/services/index.ts`** — Barrel re-export; consumers import `receive`, `adjust`, `setPreorderLimit` from the services index.
- **Tests** (`cache-invalidation.test.ts`, `preorder.test.ts`, `service.test.ts`) — Integration tests that exercise the receive → allocate → cache-sync path, the adjust guard, and the preorder-limit flow.

## Notes

- `receive` always passes `allocates: true`; `adjust` omits it. The only path that both writes stock **and** fulfils preorders in one transaction is `receive`.
- `setPreorderLimit` is deliberately **not** a stock movement: no ledger row is written, only an audit event. Lowering the limit below outstanding preorders is allowed—existing orders stand.
- `adjust`'s `onFailure` re-reads the product to distinguish "product deleted mid-flight" (404) from "correction would go below reserved" (409). The single boolean return from `applyTransition` cannot tell them apart.
- `context` (audit caller) is optional on every export; tests pass `undefined` to suppress the audit emit.
- `receive`'s `quantity` is contractually strictly positive (enforced upstream); `adjust`'s `delta` is signed and non-zero.
