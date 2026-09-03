/*
 * Backfill `users.termsAccepted`, the required signup checkbox.
 *
 * Every existing row gets `true`, same reasoning as `user-verified-column.js`: the schema's own
 * default is also `true`, but written here explicitly rather than left to a runtime default, to
 * match how every other backfilled boolean in this file is handled — grandfathered, not
 * retroactively distrusted. Every row that exists before this column predates the gate entirely;
 * it never had a checkbox to leave unchecked.
 *
 * `$exists: false` rather than a blanket update, so re-running cannot overwrite a `false` a
 * post-deploy write has since legitimately produced — though nothing writes `false` today, since
 * `accountService.signup` rejects anything but `true` and every other creation path defaults to
 * `true` too. Idempotent regardless.
 */
module.exports = {
    async up(db) {
        await db
            .collection('users')
            .updateMany({ termsAccepted: { $exists: false } }, { $set: { termsAccepted: true } });
    },

    async down(db) {
        await db.collection('users').updateMany({}, { $unset: { termsAccepted: '' } });
    }
};
