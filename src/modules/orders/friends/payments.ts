/**
 * @module
 * The one `orders` write `payments` may call.
 *
 * Why `payments` is the friend:  a settled payment is the only thing that moves an order to `paid`.
 *
 * @see docs/understand/strategic-ddd.md#_5-published-language-—-the-barrel
 */

export { markPaid } from '../services/status';
