---
source: src/modules/returns/services/ownership.ts
sha256: becb6a2c0c193748450c19c14fea0c02adbc4bb3483ef2843eabdb2593b3d5d3
generated_at: 2026-11-08T08:05:00.246016+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/ownership.ts

## Purpose

Answers a single gatekeeping question for the returns module: *who may open a return on a given order?* Both `createReturn` and `getReturn` call into this file before performing any return-specific work, so the authorization logic lives in one place rather than being duplicated across service files.

## Key elements

- **`OpenableOrder`** (interface) — Pairs the resolved `OrderDocument` with a `byStaff` flag indicating whether the caller is acting on the buyer's behalf rather than being the buyer themselves.
- **`ownOrder(orderId, authContext)`** — Resolves the order only if the caller is the buyer (`isBuyer`). Returns `undefined` otherwise, even if the caller can *read* the order.
- **`openableOrder(orderId, authContext)`** — The primary entry point. First tries `ownOrder`; if that fails, checks whether the caller holds the `update:Return` ability (via `holds` + `callerForSubject`). If so, fetches the order unconditionally and returns it with `byStaff: true`. Any other caller gets `undefined`, which callers map to a 404.

## Relationships

- **`@kernel/ability` → `holds`** — Checks the `update:Return` permission for the staff fallback path.
- **`@kernel/permissions` → `callerForSubject`** — Resolves the effective caller identity for a given subject (`'Return'`) before the ability check.
- **`@modules/orders` (barrel: `index.ts`)** — Provides `isBuyer` (from `domain/rules.ts`), `orderService` (from `services/index.ts`), and the `OrderDocument` type (from `model.ts`). `orderService.getForCaller` enforces per-caller visibility; `orderService.getById` bypasses it for the staff path.
- **`@types` → `AuthContext`** — The caller identity object threaded through both exports.
- **`src/modules/returns/services/create.ts`** and **`read.ts`** — Consumers that call `openableOrder` as a precondition before creating or reading a return.

## Notes

- **Ownership ≠ visibility.** `ownOrder` deliberately filters beyond what `orderService.getForCaller` allows: an operator who can *read* every order is still not the buyer, so the function returns `undefined` for them. The staff path in `openableOrder` is the only route that bypasses buyer identity.
- **Staff buying for themselves.** If a staff member holds `update:Return` *and* is the buyer, `ownOrder` succeeds first and the result is `byStaff: false` — buyer identity takes precedence.
- **`undefined` as a 404, not a 403.** The module's contract is that "not yours" looks identical to "doesn't exist" to the caller; consumers are expected to treat `undefined` as a not-found response.
