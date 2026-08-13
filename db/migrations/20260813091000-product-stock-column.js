/*
 * Backfill `products.stock`, the column checkout decrements and a customer cancel restores.
 *
 * Every existing row gets `100` — the same demo default the schema and `openapi.yaml` declare
 * for new products. There is no prior stock decision to preserve: nothing has ever counted
 * units, so any backfill is an invention, and the one that keeps every existing product buyable
 * is the only one that changes no behaviour a demo already relies on. A real deployment sets
 * real counts through the admin product form afterwards.
 *
 * `$exists: false` rather than a blanket update, so re-running cannot overwrite a count an
 * admin (or a sale) has since set. That is what makes it idempotent; `migrate-mongo status`
 * does not guarantee it.
 */
module.exports = {
    async up(db) {
        await db
            .collection('products')
            .updateMany({ stock: { $exists: false } }, { $set: { stock: 100 } });
    },

    async down(db) {
        /*
         * Drops the field entirely: the split between "backfilled" and "counted since" is not
         * recoverable.
         */
        await db.collection('products').updateMany({}, { $unset: { stock: '' } });
    }
};
