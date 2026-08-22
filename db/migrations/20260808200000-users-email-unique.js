/*
 * Make `users.email` unique.
 *
 * WHY
 * ---
 * `authService.signup` is a check-then-insert: `findOne({ email })`, then `create()` if nothing
 * came back. The collection is free to change between those two statements, so two concurrent
 * signups for one address both read "absent" and both insert. A double-clicked submit button is
 * enough to reach it. The result is two accounts on one address, with login resolving to whichever
 * document `findOne` returns first — and no application-level check can close it, because the gap
 * IS between the check and the write. Only the database can refuse the second insert.
 *
 * The schema now declares `unique: true` (see the index block in `src/models/users.ts`). Mongoose
 * creates indexes on connect, but it will NOT silently change the options of an index that already
 * exists: a deployed database carrying the old non-unique `users_email` would either keep it
 * quietly or fail at startup with an index-options conflict, depending on version. So the change
 * of options is made here, explicitly, where it can be sequenced and where it can refuse.
 *
 * THE PRE-FLIGHT
 * --------------
 * A deployed database may already hold duplicates — created, in all likelihood, by the very race
 * this closes. `createIndex` against such a collection fails with an E11000 naming ONE offending
 * value, halfway through, leaving the operator to re-run and discover the next one. That is the
 * worst possible way to learn the shape of the problem.
 *
 * So this refuses up front, and reports the whole picture: every duplicated address and how many
 * accounts hold it. Merging accounts is a product decision — which one keeps the orders, which
 * email the survivor gets — and this migration deliberately does not make it. It stops, says what
 * it found, and leaves the choice to a person.
 *
 * `null`/missing emails are excluded from the duplicate scan: `email` is `required` on the schema,
 * so an absent one is a different problem, and grouping them would report a phantom duplicate.
 */

/** Addresses held by more than one document, worst first. */
const findDuplicateEmails = (db) =>
    db
        .collection('users')
        .aggregate([
            { $match: { email: { $type: 'string' } } },
            { $group: { _id: '$email', count: { $sum: 1 }, ids: { $push: '$_id' } } },
            { $match: { count: { $gt: 1 } } },
            { $sort: { count: -1 } }
        ])
        .toArray();

module.exports = {
    async up(db) {
        const duplicates = await findDuplicateEmails(db);

        if (duplicates.length > 0) {
            const report = duplicates
                .map(({ _id, count, ids }) => `  ${_id} — ${count} accounts: ${ids.join(', ')}`)
                .join('\n');

            throw new Error(
                `Cannot make users.email unique: ${duplicates.length} address(es) are held by ` +
                    `more than one account.\n${report}\n\n` +
                    `Merge or remove the duplicates, then run this migration again. Which account ` +
                    `survives is a product decision (orders, tokens, admin flag), so this ` +
                    `migration will not choose for you.`
            );
        }

        /*
         * Dropped and rebuilt rather than "altered": Mongo has no operation that changes an
         * existing index's options. Best-effort on the drop, because a fresh database has never
         * had it.
         */
        try {
            await db.collection('users').dropIndex('users_email');
        } catch {
            /* never existed — a database created after this migration */
        }

        await db
            .collection('users')
            .createIndex({ email: 1 }, { name: 'users_email', unique: true });
    },

    async down(db) {
        /*
         * Back to the non-unique index under the same name. The name matters: the schema and every
         * other migration refer to `users_email`, and restoring it under a derived name would
         * leave the collection unable to accept the original.
         *
         * Note that rolling back re-opens the signup race. That is what a rollback of this change
         * means, and it is stated here rather than discovered later.
         */
        try {
            await db.collection('users').dropIndex('users_email');
        } catch {
            /* already absent */
        }

        await db.collection('users').createIndex({ email: 1 }, { name: 'users_email' });
    }
};
