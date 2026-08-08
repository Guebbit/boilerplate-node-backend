/*
 * Initial indexes.
 *
 * Migrations own SCHEMA — indexes, collection options, field renames. Demo DATA belongs to
 * `npm run db:seed` and lives only in `db/seeds/index.ts`.
 *
 * `createIndex` is idempotent, so re-running this against an already-migrated database is a
 * no-op rather than an error.
 */
module.exports = {
    async up(db) {
        await Promise.all([
            /* Login and signup both look users up by email. */
            db.collection('users').createIndex({ email: 1 }, { name: 'users_email' }),
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
