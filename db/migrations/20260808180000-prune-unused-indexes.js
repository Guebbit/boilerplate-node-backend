/*
 * Drop three indexes nothing queries.
 *
 * An index is not free: it is rebuilt on every insert and update of the collection it belongs to,
 * and it occupies memory that the indexes doing real work would otherwise have. One that answers
 * no query is pure cost, so each of these was traced to the queries that could have used it and
 * kept only if one did.
 *
 *   users.deletedAt      — the admin listing filters the `active` column, which is a separate
 *                          field; the one login query mentioning `deletedAt` also matches on
 *                          `email`, which is near-unique and indexed, so the document is found by
 *                          address and its deletion state read from the single result.
 *
 *   auditLogs.timestamp  — descending, alongside the ascending TTL index on the same field. A
 *     (descending)         single-field index is walked in either direction, so the two answer
 *                          exactly the same questions and the second is maintained for nothing.
 *                          The TTL one stays: it also performs the expiry.
 *
 *   feedbackRequests     — the only query touching `email` matches case-insensitively and
 *     .email               unanchored, which no B-tree index can serve. The collection is scanned
 *                          with or without it.
 *
 * Dropping an index is the one index operation a schema cannot express — a schema declares what
 * should exist, not what should stop existing — which is why this is a migration.
 *
 * Drops are best-effort: a database that never had one of these must not fail the run.
 */
const DROPS = [
    ['users', 'users_deletedAt'],
    ['auditlogs', 'timestamp_-1'],
    ['feedbackrequests', 'email_1_createdAt_-1']
];

module.exports = {
    async up(db) {
        for (const [collection, indexName] of DROPS) {
            try {
                await db.collection(collection).dropIndex(indexName);
            } catch {
                /* index already absent */
            }
        }
    },

    async down(db) {
        /*
         * Recreated under the names Mongoose would derive, except for the user one, which keeps
         * the explicit name it was originally created with. A rollback that restored an index
         * under a different name would leave the collection unable to accept the original.
         */
        await db.collection('users').createIndex({ deletedAt: 1 }, { name: 'users_deletedAt' });
        await db.collection('auditlogs').createIndex({ timestamp: -1 });
        await db.collection('feedbackrequests').createIndex({ email: 1, createdAt: -1 });
    }
};
