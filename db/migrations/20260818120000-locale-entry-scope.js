/*
 * Give every translation entry a side, and make it part of the row's identity.
 *
 * The collection was built when there was only one dictionary to override — the client's — so a
 * row was identified by `(locale, key)`. There are two now: `api` rows are layered over the API's
 * own deployed files at resolution time, `app` rows are served to a frontend. Both dictionaries
 * declare a top-level `generic`, so `generic.error-internal` is one string in each, and a key
 * alone can no longer tell them apart.
 *
 * The order below is not interchangeable. The backfill runs FIRST, because the new unique index
 * spans a field that does not exist yet — Mongo indexes a missing field as `null`, so building the
 * index over unbackfilled rows would make every `(locale, null, key)` collide with nothing and
 * then, on the first write of a real scope, silently permit a duplicate. The old index is dropped
 * LAST, so an interrupted run leaves the stricter constraint in place rather than none.
 *
 * `up` is idempotent: the backfill only touches rows that lack the field, and both index calls are
 * no-ops when they already match. THE NAMES MUST MATCH THE SCHEMA'S — Mongo identifies an index by
 * name as well as by key spec, and `tests/unit/db/migration-model-indexes.test.ts` is what catches
 * a disagreement between this file and `src/modules/locales/model.ts`.
 */
module.exports = {
    async up(db) {
        const entries = db.collection('localemessages');

        /*
         * Every existing row is a client override: `api` rows could not have been created, because
         * nothing could say so until this migration. `$exists: false` rather than a blanket update
         * so a re-run cannot rewrite a scope somebody has since set deliberately.
         */
        await entries.updateMany({ scope: { $exists: false } }, { $set: { scope: 'app' } });

        await entries.createIndex(
            { locale: 1, scope: 1, key: 1 },
            { name: 'localeMessages_locale_scope_key', unique: true }
        );

        try {
            await entries.dropIndex('localeMessages_locale_key');
        } catch {
            /* a database created after this migration never had it */
        }
    },

    async down(db) {
        const entries = db.collection('localemessages');

        /*
         * The column stays; only the constraint moves back.
         *
         * Dropping `scope` would destroy the one thing this migration added that a person could
         * have typed — which side an override belongs to — and the old index tolerates the field
         * being there. What a rollback genuinely costs is the ability to hold the same key for
         * both dictionaries, so the restore below can FAIL on a database that already does. That
         * is the honest outcome: it means the rows disagree with the constraint being asked for,
         * and deleting one side to satisfy a rollback is not a decision this file gets to make.
         */
        await entries.createIndex(
            { locale: 1, key: 1 },
            { name: 'localeMessages_locale_key', unique: true }
        );

        try {
            await entries.dropIndex('localeMessages_locale_scope_key');
        } catch {
            /* never created, or already dropped */
        }
    }
};
