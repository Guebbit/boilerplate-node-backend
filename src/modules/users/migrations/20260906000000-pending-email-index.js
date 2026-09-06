/*
 * Adds `users_pending_email` — a database that already ran the generated baseline never picks up
 * a NEW index declared on the schema afterwards, since `gen:migrations` records the baseline as
 * applied by filename, not by content. See `docs/reference/data.md` and the index's own comment
 * in `src/modules/users/model.ts`.
 */

module.exports = {
    async up(db) {
        // A doc already sitting on a duplicate `pendingEmail` would make `createIndex` fail with
        // no indication of which rows collide — this codebase's baseline generator refuses the
        // same way (`scripts/db/build-migrations.ts`'s `refuseDuplicates`), so this mirrors it for
        // the one index built by hand instead of generated.
        const duplicates = await db
            .collection('users')
            .aggregate([
                { $match: { pendingEmail: { $exists: true, $ne: null } } },
                { $group: { _id: '$pendingEmail', count: { $sum: 1 }, ids: { $push: '$_id' } } },
                { $match: { count: { $gt: 1 } } }
            ])
            .toArray();

        if (duplicates.length > 0)
            throw new Error(
                `Cannot make users.pendingEmail unique: ${duplicates.length} value(s) are held ` +
                    `by more than one document:\n${duplicates
                        .map(({ _id, count, ids }) => `  ${_id} — ${count} rows: ${ids.join(', ')}`)
                        .join('\n')}`
            );

        await db.collection('users').createIndex(
            { pendingEmail: 1 },
            {
                name: 'users_pending_email',
                unique: true,
                partialFilterExpression: { pendingEmail: { $exists: true } }
            }
        );
    },

    async down(db) {
        // Best-effort: a database that never ran `up`, or where the index was dropped by hand,
        // must not fail the rollback.
        await db
            .collection('users')
            .dropIndex('users_pending_email')
            .catch(() => {
                /* never created, or already dropped */
            });
    }
};
