/*
 * Backfill `users.active`, a stored column rather than a value derived from `deletedAt`.
 *
 * "Is this account enabled" and "has this account been soft-deleted" are independent facts,
 * matching how products work: an account can be deactivated without being deleted, and a
 * soft-deleted account keeps whatever `active` it had.
 *
 * Every row gets `true`, including soft-deleted ones. `active = !deletedAt` would look like the
 * safe backfill, but no user has ever had an `active` value set, so there is no prior decision to
 * preserve — and copying `deletedAt` into the new column would re-couple the two facts on day one.
 * Deletion stays tracked in `deletedAt`.
 *
 * `$exists: false` rather than a blanket update, so re-running cannot overwrite a value an admin
 * has since set. That is what makes it idempotent; `migrate-mongo status` does not guarantee it.
 */
module.exports = {
    async up(db) {
        await db
            .collection('users')
            .updateMany({ active: { $exists: false } }, { $set: { active: true } });
    },

    async down(db) {
        /*
         * Drops the field entirely: the split between "never set" and "set to the default" is
         * not recoverable.
         */
        await db.collection('users').updateMany({}, { $unset: { active: '' } });
    }
};
