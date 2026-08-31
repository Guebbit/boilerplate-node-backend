/**
 * @module
 * Orders — public barrel, the only surface a sibling module may import. The schema and its
 * transform stay out — only tests reach `@modules/orders/model` directly. `cart` reaches the
 * repository rather than the service because checkout owns its own transaction and rolls it back
 * if clearing the cart fails.
 *
 * `sumLineItems`, `orderTotal`, `canTransition` and `statusesLeadingTo` are published because they
 * are rules with one owner: `cart` and `payments` must reuse this module's arithmetic and
 * lifecycle rather than keep a second opinion. `Money` and `ORDER_LIFECYCLE` stay inside.
 */

export { orderService } from './service';
// `cart` reports `order_created` from its own checkout, calling back into the owning module
// rather than this one reaching up for a `Request` it must never see.
export { orderRepository } from './repository';
export { ORDER_CANCELLED, ORDER_STATUS_CHANGED } from './events';
// `cart` sends the confirmation itself: only the checkout has the recipient's locale in scope.
export { orderConfirmEmail } from './emails';
// `OrderDocumentItem` stays unpublished — tests derive order lines from a product fixture
// (`tests/fixtures.ts`'s `toOrderItem`) instead of casting around the type.
export type { OrderDocument } from './model';
export { sumLineItems, orderTotal, canTransition, statusesLeadingTo } from './domain';
