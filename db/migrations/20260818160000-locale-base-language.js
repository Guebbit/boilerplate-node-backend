/*
 * Give every language its ISO 639-1 primary subtag as a column.
 *
 * `tag` is a full BCP 47 tag and may carry a region — `pt-BR`, `pt-PT`. `baseLanguage` is what
 * sits in front of the first hyphen, and it is the field that groups a language's variants:
 * "everything Portuguese" is a query on this, and a query cannot be written against a
 * `split('-')` performed in application code.
 *
 * Derived here exactly as `deriveBaseLanguage` derives it in `src/modules/locales/model.ts`. The
 * two must agree, and they agree by being the same three operations rather than by a shared
 * import — a migration that imports application code stops being a record of what the database
 * did and starts being a thing that breaks when the application is refactored.
 *
 * No index. `baseLanguage` is not queried by anything yet, and this repo prunes indexes that buy
 * nothing (`20260808180000-prune-unused-indexes.js`); the day something groups by it, that is the
 * migration to add.
 *
 * Idempotent: `$exists: false` means a re-run touches nothing already backfilled, and it will not
 * rewrite a value somebody has since corrected by hand.
 */
module.exports = {
    async up(db) {
        const languages = db.collection('locales');

        const rows = await languages.find({ baseLanguage: { $exists: false } }).toArray();

        for (const { _id, tag } of rows) {
            const baseLanguage = String(tag ?? '')
                .split('-')[0]
                .trim()
                .toLowerCase();

            await languages.updateOne({ _id }, { $set: { baseLanguage } });
        }
    },

    async down(db) {
        /*
         * The column goes, and losing it costs nothing: every value in it is derivable from the
         * `tag` sitting in the same document, which is why this is one of the few rollbacks here
         * that can safely destroy data.
         */
        await db.collection('locales').updateMany({}, { $unset: { baseLanguage: '' } });
    }
};
