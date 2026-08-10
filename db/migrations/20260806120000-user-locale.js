/*
 * Backfill `users.locale`.
 *
 * The field is what out-of-band work reads when there is no request to negotiate
 * `Accept-Language` from — a queued email, a nightly job. New users get it at signup from the
 * request they signed up in (see `services/auth.ts`); everyone who registered before this
 * migration has nothing, so they are given `NODE_DEFAULT_LOCALE`.
 *
 * The Mongoose schema declares the same default, which covers documents created through the
 * model. It does NOT cover documents already on disk: a schema default is applied on write, not
 * on read, so an existing user would keep answering `undefined` forever. Hence the backfill.
 *
 * `$exists: false` rather than a blanket update, so re-running this cannot overwrite a
 * preference a user has since chosen. That makes it idempotent, which `migrate-mongo status`
 * does not guarantee on its own.
 */
const DEFAULT_LOCALE = process.env.NODE_DEFAULT_LOCALE || 'en';

module.exports = {
    async up(db) {
        await db
            .collection('users')
            .updateMany({ locale: { $exists: false } }, { $set: { locale: DEFAULT_LOCALE } });
    },

    async down(db) {
        /*
         * Drops the field entirely rather than restoring "no value for some, a value for
         * others": that distinction is not recoverable, and the schema default makes an absent
         * field behave exactly as it did before this migration existed.
         */
        await db.collection('users').updateMany({}, { $unset: { locale: '' } });
    }
};
