---
source: src/modules/returns/services/options.ts
sha256: 4ab512cc3df8efc47c8d05460be95bbf22bf692fc1a201573e6df82ee7b69beb
generated_at: 2026-11-08T08:04:33.047493+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/options.ts

## Purpose

Computes, in one authoritative pass, what an order can still return and what it can still cancel. By centralising the quantity math, refund calculation, and reason-deadline checks here, no client (or other service) needs to re-derive returnable/cancelable state.

## Key elements

- **`getReturnOptions`** (exported) — the sole public entry point. Resolves the order for the caller, then in parallel fetches existing returns, shipped quantities, and fulfillment remainders, and assembles a `ReturnOptions` payload (reasons, exceptions, returnable lines, cancelable lines with exact refund amounts).
- **`readableOrder`** (internal) — resolves which order the caller may inspect: staff holding `read:Return` see any order; everyone else is restricted to their own via `ownOrder`.
- **`offeredReasons`** (internal) — determines which `ReturnReason` values are available to the caller (buyer: only open-deadline reasons; staff with `update:Return`: all reasons, plus a list of past-deadline non-withdrawal reasons as `exceptions`).
- **`optionLines`** (internal) — converts a product→quantity map into display lines, attaching the frozen product title and a `withdrawable` flag.
- **`OfferedReasons`** (internal interface) — shapes the result of `offeredReasons` (`reasons`, `exceptions`, `staff`).

## Relationships

- **`src/infrastructure/http/response.ts`** — wraps all output in `generateSuccess` / `generateReject` envelope.
- **`src/infrastructure/i18n/index.ts`** — imports `t` for the 404 message.
- **`src/kernel/ability.ts`** — calls `holds` to check `read:Return` and `update:Return` abilities.
- **`src/kernel/permissions.ts`** — calls `callerForSubject` to build the ability-check subject.
- **`src/modules/delivery/index.ts`** — calls `deliveryService.shippedQuantities` and `deliveryService.remainderOptions` to get what has shipped and what remainders exist.
- **`src/modules/orders/index.ts`** — calls `orderService.getById`, uses `isBuyer` and `isExcludedFromWithdrawal`, and consumes the `OrderDocument` type.
- **`src/modules/returns/domain/index.ts`** — imports `holdsReturnedGoods`, `isGuaranteeReason`, `isReasonOpen`, `reasonsOpenAt`, `returnableQuantities`, `wireLines`, and the `ProductQuantity` type.

## Notes

- **Excluded-goods gate (Art. 16):** items flagged `isExcludedFromWithdrawal` are hidden from `returnable` unless the caller is staff or at least one open reason is a guarantee reason (defect / wrong item). The `excludedOffered` boolean captures this.
- **No open reasons → empty returnable:** if `reasons.length === 0`, the returnable array is short-circuited to `[]` without calling `returnableQuantities`.
- **`cancel` boolean mirrors the door:** the `cancelable[].cancel` flag is computed with the same `cancelRefusalOf` predicate used by the actual cancel endpoint, so the UI never surfaces a button that would be refused server-side.
- **Staff exceptions are informational only:** they preview which non-withdrawal reasons are past their deadline (and would therefore be waived) without actually opening anything.
