/*
 * Initial indexes.
 *
 * This is the original bootstrap and it has already run against every database, so it is kept as
 * written rather than edited. Which indexes a collection should have is decided on its schema
 * now; the ones still wanted are declared there under these same names, and a later migration
 * drops the one that is not. The names must stay identical to the schemas': Mongo rejects a
 * request for a key it already holds under a different name, and the app issues its own request
 * at startup. A new index belongs on a schema alone.
 *
 * Demo DATA belongs to `npm run db:seed`.
 *
 * `createIndex` is idempotent, so re-running this against an already-migrated database is a
 * no-op rather than an error — but only while the OPTIONS match too. Mongo compares name, key
 * spec and options together: same name and key with different options is
 * `IndexOptionsConflict`, not a no-op. That is why `users_email` below carries `unique: true`
 * even though this file is otherwise kept as written. The schema declares it unique (see the
 * index block in `src/models/users.ts`), the app builds its indexes at startup, and a migration
 * asking for the non-unique version afterwards fails on every booted database.
 *
 * Editing it here is inert for databases that have already run this migration — they get the
 * change from `20260808200000-users-email-unique.js`, which also refuses to run against
 * duplicate data. This line is what a database created FROM SCRATCH gets, and it has to agree
 * with the schema on day one. `tests/unit/db/migration-model-indexes.test.ts` is the test that
 * catches the disagreement.
 */
module.exports = {
    async up(db) {
        await Promise.all([
            /*
             * Login and signup both look users up by email.
             *
             * UNIQUE: signup is a check-then-insert, so only the database can refuse the second
             * of two concurrent registrations for one address. See the schema for the full note.
             */
            db.collection('users').createIndex({ email: 1 }, { name: 'users_email', unique: true }),
            /* Refresh-token verification and the reset/delete flows query by token value. */
            db
                .collection('users')
                .createIndex({ 'tokens.token': 1 }, { name: 'users_tokens_token' }),
            /* Soft-delete filter used by the admin user search. */
            db.collection('users').createIndex({ deletedAt: 1 }, { name: 'users_deletedAt' }),

            /* Default listing sort. */
            db
                .collection('products')
                .createIndex({ createdAt: -1 }, { name: 'products_createdAt' }),
            /* Storefront filters: active + not soft-deleted. */
            db
                .collection('products')
                .createIndex({ active: 1, deletedAt: 1 }, { name: 'products_active_deletedAt' }),

            /* "My orders" lookups, newest first. */
            db
                .collection('orders')
                .createIndex({ userId: 1, createdAt: -1 }, { name: 'orders_userId_createdAt' }),
            db.collection('orders').createIndex({ email: 1 }, { name: 'orders_email' })
        ]);
    },

    async down(db) {
        /* Index drops are best-effort — a missing index must not fail the rollback. */
        const drops = [
            ['users', 'users_email'],
            ['users', 'users_tokens_token'],
            ['users', 'users_deletedAt'],
            ['products', 'products_createdAt'],
            ['products', 'products_active_deletedAt'],
            ['orders', 'orders_userId_createdAt'],
            ['orders', 'orders_email']
        ];

        for (const [collection, indexName] of drops) {
            try {
                await db.collection(collection).dropIndex(indexName);
            } catch {
                /* index already absent */
            }
        }
    }
};
