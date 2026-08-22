/*
 * Backfill `users.verified`, the email-confirmation flag the verify flow writes.
 *
 * Every existing row gets `true`, which is the opposite of the schema's default (`false`), and
 * deliberately so: the default describes a NEW self-signup, which has not confirmed its address
 * yet, while every account that exists before this column does predates the flow entirely — it
 * never had a chance to verify, and retroactively distrusting it would put the "confirm your
 * email" nag in front of exactly the users who have been here longest. Grandfathering them is
 * the only reading under which the column means one thing.
 *
 * `$exists: false` rather than a blanket update, so re-running cannot overwrite a `false` that a
 * post-deploy signup has since legitimately acquired. That is what makes it idempotent;
 * `migrate-mongo status` does not guarantee it.
 */
module.exports = {
    async up(db) {
        await db
            .collection('users')
            .updateMany({ verified: { $exists: false } }, { $set: { verified: true } });
    },

    async down(db) {
        /*
         * Drops the field entirely: the split between "grandfathered", "confirmed through the
         * flow" and "never confirmed" is not recoverable.
         */
        await db.collection('users').updateMany({}, { $unset: { verified: '' } });
    }
};
