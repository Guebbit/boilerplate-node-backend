---
source: src/modules/shop-tasks/services/work-summary.ts
sha256: 69f0423a4d4d5b625cbb0cdd9f0fddcb24bac518274cd80b683be34546e51818
generated_at: 2026-11-14T21:54:35.697476+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/services/work-summary.ts

## Purpose

Provides the open-work counts that populate the staff navigation badges in the shop-tasks module. Each count is fetched through the owning domain module's own list service using the caller's context, so a badge number and the screen it points to can never disagree. The only export is `workSummary`, which returns a `ShopWorkSummary` object containing only the badges the caller is permitted to see.

## Key elements

- **`Badge`** (internal interface) — shape of one nav badge: `key` (which `ShopWorkSummary` field it fills), `opens` (permission gate), and `count` (async count fetch).
- **`mayOpen(action, subject)`** — curried permission helper; returns a `(caller) => boolean` that asks `holds` whether the caller satisfies the given action on the subject.
- **`ONE_ROW`** — `{ pageSize: 1 }`, passed to every list call so only the `meta.totalItems` field is needed.
- **`totalOf(page)`** — extracts `meta.totalItems` from a paginated response.
- **`BADGES`** — ordered array of the five badge definitions: `salesOrders`, `salesPayments`, `returns`, `salesPreorders`, `inventory`.
- **`workSummary(caller)`** (export) — filters `BADGES` by the caller's permissions, resolves all counts in parallel, and returns a `ShopWorkSummary` object (absent key = no access; `0` = accessible but empty).

## Relationships

- **`src/kernel/ability.ts`** — provides `holds`, the permission check used by `mayOpen`.
- **`src/kernel/permissions.ts`** — provides `callerForSubject` and the `ActionOn`/`PermissionSubject` types that scope the caller and type the action/subject pair.
- **`src/modules/orders/index.ts`** (→ `src/modules/orders/services/index.ts`) — re-exports `orderService`; its `search` method supplies the `salesOrders` badge count (awaiting shipment, not deleted).
- **`src/modules/payments/index.ts`** (→ `src/modules/payments/services/index.ts`) — re-exports `paymentService`; its `listAttention` method supplies the `salesPayments` badge count.
- **`src/modules/returns/index.ts`** (→ `src/modules/returns/services/index.ts`) — re-exports `returnService`; its `listReturns` method supplies the `returns` badge count (status `requested`).
- **`src/modules/delivery/index.ts`** (→ `src/modules/delivery/services/index.ts`) — re-exports `deliveryService`; its `listPreorderFulfillmentOrders` method supplies the `salesPreorders` badge count (late preorders).
- **`src/modules/inventory/index.ts`** (→ `src/modules/inventory/services/index.ts`) — re-exports `inventoryService`; its `listLevels` method supplies the `inventory` badge count (low stock only).
- **`src/types/auth-context.ts`** — `AuthContext` (caller identity) and `ShopWorkSummary` (return shape).
- **`src/modules/shop-tasks/controllers/get-shop-work-summary.ts`** — the HTTP controller that invokes `workSummary`.
- **`src/modules/shop-tasks/services/index.ts`** — barrel re-export of this module.

## Notes

- Every count call passes `pageSize: 1` and reads only `meta.totalItems`; no full list is ever materialized.
- The `salesOrders` badge intentionally omits the third argument to `orderService.search` to avoid triggering an `orders_viewed` analytics event on badge refresh.
- `workSummary` omits keys the caller cannot open (no key in the object) rather than returning `0`, so consumers can distinguish "no access" from "empty queue."
- `Object.fromEntries` is typed with `string` keys, hence the final `as ShopWorkSummary` cast — safe because every key is a literal `Badge.key`.
- Badge order in `BADGES` mirrors the navigation display order; the object key order is not semantically significant to consumers.
