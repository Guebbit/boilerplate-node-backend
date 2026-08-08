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

        /*
         * Last, so a database that somehow holds two carts for one user fails here loudly rather
         * than having the second one silently rejected mid-copy.
         *
         * `userId_1` is not a stylistic choice — it is Mongoose's DEFAULT name for this key, and
         * `cartSchema` declares the same index via `unique: true`. Mongo rejects a second index
         * on a key it already has under another name ("Index already exists with a different
         * name"), so naming it anything else makes `autoIndex` fail at boot on every migrated
         * database. Matching the name makes both creators idempotent: whichever runs second is a
         * no-op. The other index below is migration-only, like every index in
         * `20240101000000-initial-indexes.js`, so it keeps a descriptive name.
         */
        await carts.createIndex({ userId: 1 }, { name: 'userId_1', unique: true });
        /* Deleting a product pulls it from every cart holding it — the one query here that is not
         * addressed by `userId`. */
        await carts.createIndex({ 'items.productId': 1 }, { name: 'carts_items_productId' });
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
