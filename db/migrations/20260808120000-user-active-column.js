/*
 * Backfill `users.active`, which is a stored column now rather than a derived one.
 *
 * Until this migration, users had no `active` field at all. The API reported one — `toJSON`
 * synthesised `active = !deletedAt` on the way out — and the admin search filter reinterpreted
 * `active` as a `deletedAt` existence check. So one field wore two hats: "is this account
 * enabled" and "has this account been soft-deleted" were the same question, and neither could be
 * asked on its own. A client could also send `active` on create or update (the contract
 * advertised it, the controller validated it) and it went nowhere.
 *
 * They are independent facts now, matching how products have always worked: an account can be
 * deactivated without being deleted, and a soft-deleted account keeps whatever `active` it had.
 *
 * WHY EVERY ROW GETS `true`, INCLUDING SOFT-DELETED ONES
 * -----------------------------------------------------
 * The obvious-looking backfill is `active = !deletedAt`, preserving the value the API has been
 * reporting. It is the wrong one. That value was never a recorded intent — it was a rendering of
 * `deletedAt`, computed fresh on every read. Nobody has ever set `active` on a user, so there is
 * no prior decision to preserve, and copying `deletedAt` into the new column would re-couple on
 * day one the two things this change exists to separate.
 *
 * Deletion stays tracked where it always was, in `deletedAt`. `active` starts from the schema
 * default, which is what a field nobody has set should hold.
 *
 * One visible consequence, recorded so it is not mistaken for a bug: in the admin users list, an
 * account that was soft-deleted used to show as inactive. It now shows as active, because it is
 * — and because the `User` contract does not expose `deletedAt`, the list no longer shows that
 * the account was deleted at all. Surfacing it (as `Product` already does) is a separate change.
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
         * Drops the field entirely. An absent `active` behaves exactly as it did before this
         * migration — `applyUserTransform` derived it, so nothing read the column — and the
         * split between "never set" and "set to the default" is not recoverable anyway.
         */
        await db.collection('users').updateMany({}, { $unset: { active: '' } });
    }
};
