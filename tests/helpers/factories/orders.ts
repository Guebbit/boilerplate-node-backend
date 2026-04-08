/**
 * Order factory
 *
 * Provides:
 *
 *   toOrderItem(product, qty?) – converts a product document into the
 *                                OpenAPI OrderItem shape expected by the Order schema.
 *
 *   makeOrder(user, items)        – plain-object payload, no DB write.
 *
 *   createOrder(user, items)      – persists an order and returns the document.
 *
 * Why toOrderItem?
 * -------------------
 * The Order schema embeds a full product *snapshot* (not just an ObjectId) so
 * that order history is unaffected by later product edits.  `toOrderItem`
 * strips Mongoose internals via `toObject()` and wraps the result in the
 * `{ product, quantity }` shape the schema expects.
 *
 * Usage example
 * -------------
 *   import { createOrder, toOrderItem } from '../helpers/factories/orders';
 *
 *   const user    = await createUser();
 *   const product = await createProduct({ price: 19.99 });
 *   const order   = await createOrder(user, [toOrderItem(product, 2)]);
 */

import { Types } from 'mongoose';
import type { IOrderDocument } from '@models/orders';
import type { IUserDocument } from '@models/users';
import type { IProductDocument } from '@models/products';
import type { Order } from '@types';
import { orderRepository } from '@repositories/orders';

/**
 * Convert a Mongoose product document into an Order item ready to embed
 * inside an order.
 *
 * @param product  - The persisted product document.
 * @param quantity - How many units were ordered (default: 1).
 */
export const toOrderItem = (
    product: IProductDocument,
    quantity = 1
): Order['items'][number] => ({
    // toObject() removes Mongoose Document methods and virtuals, leaving a
    // plain JS object that matches the embedded productSchema in the Order model.
    product: product.toObject() as Order['items'][number]['product'],
    quantity
});

/**
 * Build a valid order payload from a user and a list of order items.
 *
 * @param user     - The user who placed the order.
 * @param items - Array of { product, quantity } pairs (use toOrderItem).
 */
export const makeOrder = (
    user: IUserDocument,
    items: Order['items']
): Partial<IOrderDocument> => ({
    userId: user._id as Types.ObjectId,
    email: user.email,
    items
});

/**
 * Insert an order into the test database and return the Mongoose document.
 *
 * @param user     - The user who placed the order.
 * @param items - Array of { product, quantity } pairs (use toOrderItem).
 */
export const createOrder = (
    user: IUserDocument,
    items: Order['items']
): Promise<IOrderDocument> => orderRepository.create(makeOrder(user, items));
