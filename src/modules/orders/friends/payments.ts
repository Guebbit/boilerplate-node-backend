/**
 * @module
 * The one `orders` write `payments` may call.
 *
 * Why `payments` is the friend:  a settled payment is the only thing that moves an order to `paid`.
 *
 * @see docs/understand/strategic-ddd.md §5
 */

export { markPaid } from '../services/status';
