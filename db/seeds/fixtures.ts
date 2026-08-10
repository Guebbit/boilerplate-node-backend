/*
 * The demo dataset in MONGOOSE shape — data only, no side effects.
 *
 * Split out of `index.ts` because that module seeds on import (`void runScript(...)` at the
 * bottom), so nothing could look at these values without also connecting to a database and
 * writing to it. Tests need to look at them: `tests/unit/db/seed-fixtures.test.ts` asserts every
 * `imageUrl` is a URL path that resolves to a file this repository actually ships.
 *
 * That test earns its place because nothing else catches a bad path: an `imageUrl` captured from
 * a `path.join()` carries the writing machine's separators, and a browser reads a backslash as a
 * literal filename character, so a Windows-style `\images\x.jpg` points at a 404.
 *
 * The facts themselves — ids, emails, admin flags, prices, who has what in their cart — live in
 * `./seed-identities`, which is byte-identical to a copy in the paired frontend so a `diff` catches
 * the two datasets drifting apart. This file is only the mapper from those facts into what
 * mongoose wants: `Types.ObjectId`s, real `Date`s, a cart per user in its own collection, and the
 * denormalised product snapshots an order carries.
 */

import { Types } from 'mongoose';
import { seedUsers, seedProducts, seedOrders } from './seed-identities';

export {
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_PASSWORD,
    SEED_USER_EMAIL,
    SEED_USER_PASSWORD
} from './seed-identities';

const objectId = (value: string) => new Types.ObjectId(value);

export const users = seedUsers.map((user) => ({
    _id: objectId(user.id),
    username: user.username,
    email: user.email,
    /* Plain text on purpose: the model's pre-save hook hashes it. Anything hashed by hand would
     * drift from that hook, and its plaintext would be lost. */
    password: user.password,
    imageUrl: user.imageUrl,
    admin: user.admin,
    tokens: []
}));

/*
 * Carts are their own collection, keyed by `userId`.
 *
 * Only users with something in their cart get a document: absence and an empty cart are the same
 * state, and the first write upserts one into existence. There is no `_id` to pin either, which is
 * why `seed-identities.ts` gives a cart no id — a cart is addressed by its owner, and no cart id
 * ever reaches the wire.
 */
export const carts = seedUsers
    .filter((user) => user.cart.length > 0)
    .map((user) => ({
        userId: objectId(user.id),
        items: user.cart.map((item) => ({
            productId: objectId(item.productId),
            quantity: item.quantity
        }))
    }));

export const products = seedProducts.map((product) => ({
    _id: objectId(product.id),
    title: product.title,
    price: product.price,
    imageUrl: product.imageUrl,
    active: product.active,
    description: product.description,
    ...(product.deletedAt ? { deletedAt: new Date(product.deletedAt) } : {})
}));

/*
 * An order item embeds a snapshot of the product as it was when the order was placed. Every
 * snapshot in this dataset is an exact copy of the current product, so it is rebuilt by lookup
 * instead of restated — see the note in `seed-identities.ts` for when that stops being true.
 *
 * The lookup is non-null asserted deliberately: an order referencing a product id that is not in
 * `seedProducts` is a corrupt fixture, and a seeder that silently wrote an order with a missing
 * product would be worse than one that refuses to start.
 */
const snapshotOf = (productId: string) => {
    const product = products.find((candidate) => candidate._id.toString() === productId);
    if (!product) {
        throw new Error(
            `seed fixtures: order references product ${productId}, which is not in seedProducts`
        );
    }
    /* A copy, not the reference: a snapshot that aliases the live product would let a mutation of
     * one silently rewrite the other, which is the exact thing a snapshot exists to prevent. */
    return { ...product };
};

export const orders = seedOrders.map((order) => ({
    _id: objectId(order.id),
    userId: objectId(order.userId),
    email: order.email,
    items: order.items.map((item) => ({
        product: snapshotOf(item.productId),
        quantity: item.quantity
    }))
}));
