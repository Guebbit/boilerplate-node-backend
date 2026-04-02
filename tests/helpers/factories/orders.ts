/**
 * Order factory
 *
 * Provides:
 *
 *   toOrderProduct(product, qty?) – converts a product document into the
 *                                   IOrderProduct shape expected by the Order schema.
 *
 *   makeOrder(user, products)     – plain-object payload, no DB write.
 *
 *   createOrder(user, products)   – persists an order and returns the record.
 *
 * Why toOrderProduct?
 * -------------------
 * The Order schema embeds a full product *snapshot* (not just a foreign key) so
 * that order history is unaffected by later product edits.  `toOrderProduct`
 * converts `toObject()` output into the
 * `{ product, quantity }` shape the schema expects.
 *
 * Usage example
 * -------------
 *   import { createOrder, toOrderProduct } from '../helpers/factories/orders';
 *
 *   const user    = await createUser();
 *   const product = await createProduct({ price: 19.99 });
 *   const order   = await createOrder(user, [toOrderProduct(product, 2)]);
 */

import type { IOrderDocument, IOrderProduct } from '@models/orders';
import type { IUserDocument } from '@models/users';
import type { IProductDocument } from '@models/products';
import { orderRepository } from '@repositories/orders';

const getUserId = (user: IUserDocument): number =>
    Number((user as unknown as { id?: number }).id);

/**
 * Convert a product record into an IOrderProduct ready to embed
 * inside an order.
 *
 * @param product  - The persisted product document.
 * @param quantity - How many units were ordered (default: 1).
 */
export const toOrderProduct = (product: IProductDocument, quantity = 1): IOrderProduct => ({
    // toObject() produces a plain JS object that matches the embedded product shape.
    product: product.toObject() as unknown as IOrderProduct['product'],
    quantity
});

/**
 * Build a valid order payload from a user and a list of order products.
 *
 * @param user     - The user who placed the order.
 * @param products - Array of { product, quantity } pairs (use toOrderProduct).
 */
export const makeOrder = (
    user: IUserDocument,
    products: IOrderProduct[]
): Partial<IOrderDocument> => ({
    userId: getUserId(user),
    email: user.email,
    products
});

/**
 * Insert an order into the test database and return the persisted order record.
 *
 * @param user     - The user who placed the order.
 * @param products - Array of { product, quantity } pairs (use toOrderProduct).
 */
export const createOrder = (
    user: IUserDocument,
    products: IOrderProduct[]
): Promise<IOrderDocument> => orderRepository.create(makeOrder(user, products));
