/*
 * `scope` becomes `tenant`, and its two values become tenant ids.
 *
 * The column was a two-value enum — `app` for the frontend's words, `api` for the API's own — and
 * that shape could hold exactly one frontend and one backend. A tenant is the same idea with a
 * name instead of a side: one keyspace, authored by one team, identified by an id the deployment
 * configures. The demo pair is `demo-fe` and `demo-be`, which is what the two old values map to.
 *
 * The order below is not interchangeable. The rename and the value mapping run FIRST, because the
 * new unique index spans a field that does not exist yet — Mongo indexes a missing field as
 * `null`, so building the index over unrenamed rows would let every `(locale, null, key)` collide
 * with nothing and then, on the first real write, silently permit a duplicate. The old index is
 * dropped LAST, so an interrupted run leaves the stricter constraint in place rather than none.
 *
 * `up` is idempotent: the rename only touches rows that still carry `scope`, the value mapping only
 * rows that still carry an old value, and both index calls are no-ops when they already match.
 * THE NAMES MUST MATCH THE SCHEMA'S — Mongo identifies an index by name as well as by key spec,
 * and `tests/unit/db/migration-model-indexes.test.ts` is what catches a disagreement between this
 * file and `src/modules/locales/model.ts`.
 */
const TENANT_OF_SCOPE = { app: 'demo-fe', api: 'demo-be' };

module.exports = {
    async up(db) {
        const entries = db.collection('localemessages');

        /*
         * Only rows that have NOT already been written with a tenant. A database seeded by the
         * current code and then migrated — which is what `tests/unit/db` does on purpose — holds
         * rows that carry `tenant` and, thanks to the 2026-08-18 backfill running first, a
         * `scope: 'app'` as well; renaming over them would overwrite the backend's rows with the
         * frontend's id. Those rows just lose the stale column.
         */
        await entries.updateMany(
            { scope: { $exists: true }, tenant: { $exists: false } },
            { $rename: { scope: 'tenant' } }
        );
        await entries.updateMany(
            { scope: { $exists: true }, tenant: { $exists: true } },
            { $unset: { scope: '' } }
        );

        for (const [scope, tenant] of Object.entries(TENANT_OF_SCOPE))
            await entries.updateMany({ tenant: scope }, { $set: { tenant } });

        await entries.createIndex(
            { locale: 1, tenant: 1, key: 1 },
            { name: 'localeMessages_locale_tenant_key', unique: true }
        );

        try {
            await entries.dropIndex('localeMessages_locale_scope_key');
        } catch {
            /* a database created after this migration never had it */
        }
    },

    async down(db) {
        const entries = db.collection('localemessages');

        /*
         * Only the two demo ids map back to a side; a row under any other tenant has no `scope` it
         * could honestly become, so it keeps its tenant id as the scope value and the old enum's
         * validation is the schema's problem on the old code, not this file's to guess at.
         */
        for (const [scope, tenant] of Object.entries(TENANT_OF_SCOPE))
            await entries.updateMany({ tenant }, { $set: { tenant: scope } });

        await entries.updateMany({ tenant: { $exists: true } }, { $rename: { tenant: 'scope' } });

        await entries.createIndex(
            { locale: 1, scope: 1, key: 1 },
            { name: 'localeMessages_locale_scope_key', unique: true }
        );

        try {
            await entries.dropIndex('localeMessages_locale_tenant_key');
        } catch {
            /* never created, or already dropped */
        }
    }
};
