/**
 * @module
 * The cart's one stock rule: does a line's quantity fit what is for sale. Pure.
 *
 * Three callers share it, so they cannot disagree: checkout's pre-flight (refuses), the merge
 * (flags the result) and the cart view (flags every line). `available` comes in from the service
 * layer, which reads the stock ledger through `inventoryService.availableFor`; this layer reaches
 * no sibling module. See `docs/modules/cart.md#stock-checked-in-three-places`.
 */

/**
 * Does `quantity` fit what is for sale?
 *
 * Equal fits. An unknown availability (`null` or absent: the product is gone or hidden) fits
 * nothing, "nothing to sell" being the safe direction to be wrong in for a rule that guards a
 * purchase. Callers turn the verdict into a refusal or a flag; none may turn it into a number, since
 * exact stock is for whoever holds `inventory.any.read` (`docs/theory/defences/authorization.md`).
 *
 * @param quantity - units the line holds
 * @param available - units a customer may buy right now, or `null` when unknown
 * @returns `true` when the whole quantity can be sold
 */
export const fitsStock = (quantity: number, available: number | null | undefined): boolean =>
    quantity <= (available ?? 0);
