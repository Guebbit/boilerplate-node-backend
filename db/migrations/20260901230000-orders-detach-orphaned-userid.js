/*
 * Backfill `anonymizeAfter` on orders left orphaned by an account hard-deleted BEFORE
 * `orders`' own `USER_DELETED` detach handler existed.
 *
 * Before that handler, a hard delete removed the user document and cascaded to
 * cart/wishlist/addresses, but left `orders.userId` pointing at an id that no longer resolves to
 * anyone — a dangling foreign key nobody ever unset, indistinguishable at a glance from a genuine
 * bug rather than a deliberate decision. This migration is the one-time catch-up: every order
 * whose `userId` names no CURRENT user is put on the same clock a fresh erasure now starts on its
 * own (`orders/service.ts`'s `detachUserId`) — `userId` unset, `anonymizeAfter` stamped
 * `NODE_ORDER_PII_RETENTION_DAYS` out. The order row itself is untouched: it is the invoice.
 *
 * 3650 days (10 years) is written literally rather than read from the environment: a migration
 * runs once, at a fixed moment, and re-reading a variable that might change before the NEXT
 * deploy would make this file's behaviour depend on when someone happens to run it.
 */

const RETENTION_DAYS = 3650;

module.exports = {
    async up(db) {
        const liveUserIds = await db.collection('users').distinct('_id');
        const anonymizeAfter = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

        await db.collection('orders').updateMany(
            { userId: { $exists: true, $nin: liveUserIds } },
            {
                $unset: { userId: '' },
                $set: { anonymizeAfter }
            }
        );
    },

    async down() {
        /*
         * NOT REVERSIBLE. Which user id each affected order used to carry is gone the moment
         * this migration writes — the whole point was that it named nobody. Re-running `up`
         * again is harmless (idempotent: an order already missing `userId` never matches its
         * filter a second time), but there is nothing meaningful for `down` to restore.
         */
        throw new Error(
            'This migration cannot be rolled back: the orphaned userId values it unset are not ' +
                'recoverable. If NODE_ORDER_PII_RETENTION_DAYS was set wrong, correct the ' +
                'variable and re-run the reaper — do not attempt to undo this migration.'
        );
    }
};
