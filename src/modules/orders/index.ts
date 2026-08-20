/**
 * Orders — public barrel.
 *
 * The only surface a sibling module may import. See `modules/products/index.ts` for the rule.
 *
 * The schema and its serialization transform are deliberately NOT here. Products exports its own
 * because an order embeds a product; nothing embeds an order, so the only callers are tests, and
 * they reach `@modules/orders/model` directly rather than widening a promise made to every module.
 *
 * `cart` reaches the repository rather than the service because a checkout writes the order row
 * itself and rolls it back if clearing the cart fails — that is one transaction the cart owns, not
 * an order the cart asks for. The service layer would give it a response envelope it would only
 * have to unwrap.
 *
 * `sumLineItems` and `orderTotal` are the exports that are rules rather than handles. Order money
 * is orders' arithmetic: a cart totalling its lines independently would show one number and bill
 * another, and `payments` composing the grand total itself charged the lines and forgot the
 * shipping for as long as both existed.
 *
 * `canTransition` and `statusesLeadingTo` are published for the same reason: `payments` moves an
 * order to `paid`, and deciding for itself which status means payable would be a second opinion on
 * a rule with one owner. `Money` and `ORDER_LIFECYCLE` stay inside — no sibling needs either.
 */

export { orderService } from './service';
export { orderRepository } from './repository';
export { ORDER_CANCELLED, ORDER_STATUS_CHANGED } from './events';
// `cart` sends the customer's confirmation itself: only the checkout knows the order stood, and
// only the service has the recipient's record in scope for the language it goes out in.
export { orderConfirmEmail } from './emails';
/*
 * `OrderDocumentItem` is deliberately not here. It was published so that tests could hand-build an
 * order line as `{ product, quantity } as unknown as OrderDocumentItem` — a cast that existed only
 * because the shape was wrong for what the caller had. `tests/factory.ts`'s `toOrderItem` derives
 * the line from a product document instead, so nothing outside this module names the type any more.
 */
export type { OrderDocument } from './model';
export { sumLineItems, orderTotal, canTransition, statusesLeadingTo } from './domain';
