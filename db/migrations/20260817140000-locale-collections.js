/*
 * Index the two collections behind the dynamic locale tier.
 *
 * There is no data to migrate: both collections start empty and `npm run db:seed` fills them. What
 * this migration exists for is the two constraints, and one of them is not an optimisation.
 *
 *   locales.tag                    UNIQUE. A language is created by a check-then-insert, so two
 *                                  concurrent creations of `es` both read "absent" and both write.
 *                                  No application-level check can close that — the gap IS between
 *                                  the check and the write — and only the database can refuse the
 *                                  second.
 *
 *   localeMessages.locale + key    UNIQUE. Same argument, one level down: every write path for an
 *                                  entry checks then inserts, and a bulk import doing it five
 *                                  hundred times is where a race stops being theoretical. This is
 *                                  also the index the whole-dictionary read uses — a compound
 *                                  index serves any PREFIX of its keys, so `find({ locale })` is
 *                                  answered by this one and a second index on `locale` alone would
 *                                  be write cost buying nothing.
 *
 * THE NAMES MUST MATCH THE SCHEMAS'. Mongo identifies an index by name as well as by key spec, so
 * the same key under a different name is `IndexKeySpecsConflict` rather than a no-op — and the app
 * issues its own `createIndex` for both of these at startup. They are declared in
 * `src/modules/locales/model.ts` under exactly these names;
 * `tests/unit/db/migration-model-indexes.test.ts` is what catches a disagreement, since a booted
 * database and a migrated one only ever meet on a real deployment.
 *
 * Mongo's collection name is `localemessages`, lowercased and pluralised from the `LocaleMessage`
 * model — the same derivation that gives `audit-logs` its `auditlogs`.
 */
module.exports = {
    async up(db) {
        await Promise.all([
            db.collection('locales').createIndex({ tag: 1 }, { name: 'locales_tag', unique: true }),

            db
                .collection('localemessages')
                .createIndex(
                    { locale: 1, key: 1 },
                    { name: 'localeMessages_locale_key', unique: true }
                )
        ]);
    },

    async down(db) {
        /*
         * The indexes go; the rows stay.
         *
         * Rolling a schema change back is not a reason to destroy translation work, and these two
         * collections hold nothing else — every row in them was typed by someone. What a rollback
         * genuinely means here is that the two uniqueness guarantees are gone and the races
         * described above are open again, which is stated rather than discovered.
         *
         * Best-effort, because a database that never ran `up` must not fail the run.
         */
        for (const [collection, indexName] of [
            ['locales', 'locales_tag'],
            ['localemessages', 'localeMessages_locale_key']
        ]) {
            try {
                await db.collection(collection).dropIndex(indexName);
            } catch {
                /* never created, or already dropped */
            }
        }
    }
};
