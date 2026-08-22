/*
 * Give every order a `shippingCost`, so an absent one stops meaning two things.
 *
 * `orderTotal` reads a missing `shippingCost` as nothing owed, and that reading covered two unlike
 * states: a checkout that chose no delivery method (live, ordinary, permanent) and an order
 * written before the `delivery` module existed (history). The second was the only old data shape
 * in this repository tolerated without a migration recording it — and it sat in the money path,
 * where a reader tightening the column had no way to learn whether any row still lacked it.
 *
 * The schema now defaults the column to 0, so new writes cannot produce the shape. This closes the
 * other half: after it, no order lacks the field, and the tolerance in `orderTotal` is a defence
 * against a malformed document rather than a contract with the database.
 *
 * `0` rather than a guess: an order placed before delivery existed was never charged for shipping.
 * Filtered on `$exists: false`, so re-running cannot overwrite a real cost — `migrate-mongo status`
 * records that a migration ran, it does not make it safe to run twice.
 *
 * `shippingMethod` and `shippingAddress` are deliberately left absent. No method WAS chosen on
 * these orders, and inventing one would be a claim about history rather than a repair of it.
 */
module.exports = {
    async up(db) {
        await db
            .collection('orders')
            .updateMany({ shippingCost: { $exists: false } }, { $set: { shippingCost: 0 } });
    },

    async down(db) {
        /*
         * Only the zeros go back, and only where no method was recorded: a real cost is a fact
         * about what a customer was charged, and a rollback has no business destroying one.
         */
        await db
            .collection('orders')
            .updateMany(
                { shippingCost: 0, shippingMethod: { $exists: false } },
                { $unset: { shippingCost: '' } }
            );
    }
};
