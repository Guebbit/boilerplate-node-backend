/*
 * Give orders the soft-delete surface products and users already have: a `deletedAt` field and
 * the index the non-admin read scope filters on.
 *
 * No backfill. `deletedAt` is absent on a live record — `visibleScope` tests `$exists: false`,
 * not a null — so every existing order is already in the correct state, and writing an explicit
 * null into all of them would make each one *look* soft-deleted to that filter. There is nothing
 * to migrate in the data; only the index is new.
 *
 * `{ userId: 1, deletedAt: 1 }` rather than `{ deletedAt: 1 }` alone: an order read is always
 * scoped by owner first (`ownerScope`), so the compound index serves the query the application
 * actually issues. Admins pass no scope and so use none of this.
 *
 * `createIndex` is idempotent, so re-running against an already-migrated database is a no-op.
 */
module.exports = {
    async up(db) {
        await db
            .collection('orders')
            .createIndex({ userId: 1, deletedAt: 1 }, { name: 'orders_userId_deletedAt' });
    },

    async down(db) {
        /*
         * Tolerates an already-absent index: `down` running twice, or after a manual drop, is
         * not an error worth failing a rollback over. Codes 27 and 26 are IndexNotFound and
         * NamespaceNotFound.
         */
        try {
            await db.collection('orders').dropIndex('orders_userId_deletedAt');
        } catch (error) {
            if (error.code !== 27 && error.code !== 26) throw error;
        }

        /*
         * The field goes with the index. Nothing else reads `deletedAt` on an order once this
         * migration is rolled back, and leaving it would hide records from a `visibleScope` that
         * no longer exists.
         */
        await db.collection('orders').updateMany({}, { $unset: { deletedAt: '' } });
    }
};
