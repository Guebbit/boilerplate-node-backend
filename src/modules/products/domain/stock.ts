/**
 * @module
 * `available` — what a customer may buy — from the two stock counters `@modules/inventory` writes
 * onto every product. Lives beside the model, not in `inventory` or `cart`: the kernel and the
 * domain layers hold no business rules of their own (`docs/theory/layers.md`), and a product's
 * catalogue price/availability is this module's own invariant, the same reasoning `tax.ts` follows
 * for `resolveTaxRate`.
 */

/**
 * Units a customer may actually buy, clamped at zero. `reserved` should never exceed `onHand` —
 * every inventory transition guards it — but a negative count must never reach a screen.
 * @param onHand - units that physically exist; absent reads as zero
 * @param reserved - units an open order has claimed; absent reads as zero
 * @returns units available to sell, never below zero
 */
export const availableStock = (onHand?: number, reserved?: number): number =>
    Math.max(0, (onHand ?? 0) - (reserved ?? 0));
