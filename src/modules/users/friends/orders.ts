/**
 * @module
 * The one `users` write `orders` may call.
 *
 * Why `orders` is the friend:  `orders` owns the cancellation count that justifies the hold, so no
 *                              other module may take a hold on its own.
 *
 * @see docs/understand/strategic-ddd.md §5
 */

export { takeAutomaticPurchaseHold } from '../services/purchase-hold';
