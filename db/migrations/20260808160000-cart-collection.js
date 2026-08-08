/*
 * Move the cart out of the user document and into its own `carts` collection.
 *
 * Both halves run in the same deploy — copy, then unset — because nothing reads the embedded cart
 * after this ships. There is no dual-read window to keep open: the API contract is unchanged
 * (`CartResponse` never carried a cart id, and `CartItem` was already `{ productId, quantity }`),
 * so a client cannot tell which side of this migration it is talking to.
 *
 * Two renames happen on the way, both toward the contract:
 *
 *   - `cart.items[].product` → `items[].productId`, so a stored line and a wire line are the same
 *     shape and there is no mapper between them;
 *   - the per-item `_id`s Mongoose generated for the embedded subdocuments are dropped — cart lines
 *     are addressed by their product, and `CartItem` is `additionalProperties: false`.
 *
 * Empty carts are not migrated. Absence and an empty cart are the same state, and the first write
 * upserts the document into existence.
 *
 * Idempotent: the copy upserts on `userId`, and once `cart` is unset there is nothing left to find.
 *
 * Creates no indexes. The cart schema declares them and the app builds them on connect, which
 * keeps one place deciding what is indexed and nothing able to disagree with it about a name.
 */
module.exports = {
    async up(db) {
        const users = db.collection('users');
        const carts = db.collection('carts');

        const writes = [];
        const cursor = users.find({ 'cart.items.0': { $exists: true } });

        for await (const user of cursor) {
            writes.push({
                updateOne: {
                    filter: { userId: user._id },
                    update: {
                        $set: {
                            items: user.cart.items.map((item) => ({
                                productId: item.product,
                                quantity: item.quantity
                            })),
                            updatedAt: user.cart.updatedAt ?? new Date()
                        },
                        /* The cart existed from the moment the user did — the schema defaulted it
                         * to an empty array — so the account's own creation date is the truest
                         * `createdAt` available. `cart.updatedAt` covers accounts older than the
                         * `timestamps` option. */
                        $setOnInsert: { createdAt: user.createdAt ?? user.cart.updatedAt }
                    },
                    upsert: true
                }
            });
        }

        if (writes.length > 0) await carts.bulkWrite(writes);

        await users.updateMany({ cart: { $exists: true } }, { $unset: { cart: '' } });
    },

    async down(db) {
        const users = db.collection('users');
        const carts = db.collection('carts');

        const writes = [];
        const cursor = carts.find({});

        for await (const cart of cursor) {
            writes.push({
                updateOne: {
                    filter: { _id: cart.userId },
                    update: {
                        $set: {
                            cart: {
                                items: cart.items.map((item) => ({
                                    product: item.productId,
                                    quantity: item.quantity
                                })),
                                updatedAt: cart.updatedAt ?? new Date()
                            }
                        }
                    }
                }
            });
        }

        if (writes.length > 0) await users.bulkWrite(writes);

        /* Users whose cart was empty had nothing copied out, so they get the empty cart the old
         * schema guaranteed rather than no field at all. */
        await users.updateMany(
            { cart: { $exists: false } },
            { $set: { cart: { items: [], updatedAt: new Date() } } }
        );

        await carts.drop().catch(() => {
            /* collection already absent */
        });
    }
};
