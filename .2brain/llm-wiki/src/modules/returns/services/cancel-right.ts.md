---
source: src/modules/returns/services/cancel-right.ts
sha256: ae45148197c6dc683dec9bdac07ef10d8e7d8824960abcbcf2e41fc1108c5a6b
generated_at: 2026-10-29T05:41:13.056200+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/services/cancel-right.ts

## Purpose

Defines the single shared rule for who may cancel a remainder (the unshipped portion of an order). It exists so that the enforcing door (`cancel-remainder.ts`) and the UI options reader (`options.ts`) agree on the same decision, preventing a situation where the button offers an action the door then refuses.

## Key elements

- **`CancelRefusal`** — union type `'window-closed' | 'excluded' | 'no-key'`; enumerates the three reasons a caller may be denied.
- **`cancelRefusalOf(order, authContext, remainder, statedAt?)`** — the sole logic function. Returns the *first* applicable refusal, or `undefined` when the caller is permitted. Check order:
  1. Non-buyer without the `create:Refund` ability → `'no-key'`.
  2. If the caller is *not* the buyer **and** `statedAt` is absent (staff cancelling for their own reasons), the call passes immediately.
  3. Withdrawal window expired (compared against `statedAt` or now) → `'window-closed'`.
  4. If the shop has not started work (`hasShopStarted` is false), the call passes.
  5. Any line in `remainder` whose product is excluded from withdrawal (Art. 16) → `'excluded'`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@kernel/ability` | Calls `holds` to check the `create:Refund` ability. |
| `@kernel/permissions` | Calls `callerForSubject` to resolve the effective subject for the ability check. |
| `@modules/orders` (barrel) | Imports `isBuyer`, `hasShopStarted`, `isExcludedFromWithdrawal`, `withdrawalClosesAt`, and the `OrderDocument` type. These are defined across `domain/lifecycle.ts`, `domain/withdrawal.ts`, `domain/rules.ts`, and `model.ts`. |
| `../domain` (returns barrel) | Imports the `ProductQuantity` type (defined in `domain/quantities.ts`). |
| `@types` | Imports the `AuthContext` type. |
| `cancel-remainder.ts` | Consumes `cancelRefusalOf` as the enforcement gate (the "door"). |
| `options.ts` | Consumes `cancelRefusalOf` to decide whether to *offer* the cancellation action (the "button"). |

## Notes

- **`statedAt` is the crux of the buyer-vs-staff asymmetry.** When staff record a withdrawal the buyer stated in the shop, `statedAt` is set to the date the buyer stated it, and the window check uses *that* date rather than the current moment. For the buyer acting directly, or for staff cancelling under their own authority, `statedAt` is absent and the check falls back to `new Date()`.
- **A single excluded line blocks the whole remainder.** `remainder.some(…)` means if even one product in the cancelled lines is made-to-order (Art. 16), the entire cancellation is refused once the shop has started work.
- **Buyer status overrides the key check.** If `isBuyer` is true, the `create:Refund` ability is *not* required; the buyer proceeds to the window/exclusion checks. The two limits that still apply to the buyer (window, exclusion) also apply to staff recording a buyer-stated withdrawal.
- **Check order is intentional.** `no-key` is evaluated before the buyer-specific paths so that a non-buyer without the key is rejected unconditionally, regardless of `statedAt`.
