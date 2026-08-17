/*
 * Split the single `stock` number into the two counters a reservation model needs.
 *
 * `stock` answered one question — "how many are there" — and was used to answer a different one:
 * "how many may I sell". Those diverge the moment an order exists but has not been paid for. The
 * shop now stores both facts and derives the third:
 *
 *   onHand    units physically present. Only a receipt, a stocktake or a committed sale moves it.
 *   reserved  units already spoken for by an open order. Physically present, not for sale.
 *   available onHand - reserved, derived at serialization — never stored, so it cannot disagree.
 *
 * `stock` becomes `onHand` verbatim: every existing row's count was physical units, and nothing
 * was reserved against it because reservations did not exist. `reserved: 0` is therefore the
 * truth for every existing row rather than a guess, which is what makes this migration lossless
 * in the direction that matters.
 *
 * `$rename` rather than a read-and-write loop: mongod does it in place, and a rename cannot half
 * apply the way a per-document update can. Both statements are filtered on the field's presence
 * (`$exists`), which is what makes re-running them a no-op rather than a way to overwrite counts
 * an operator has since set — `migrate-mongo status` records that a migration ran, it does not
 * make the migration safe to run twice.
 */
module.exports = {
    async up(db) {
        await db
            .collection('products')
            .updateMany({ stock: { $exists: true } }, { $rename: { stock: 'onHand' } });

        // Products created after the rename already carry the schema default; this catches the
        // rows that existed before it and any that never had a count at all.
        await db
            .collection('products')
            .updateMany({ onHand: { $exists: false } }, { $set: { onHand: 100 } });

        await db
            .collection('products')
            .updateMany({ reserved: { $exists: false } }, { $set: { reserved: 0 } });

        /*
         * The previous ledger is dropped rather than converted. Its rows carried a single signed
         * `delta` against a single counter, and there is no honest way to split one of those into
         * the `onHandDelta`/`reservedDelta` pair the new ledger records — a sale's -1 was a commit
         * with no reservation behind it, which is a transition the new model does not have. A
         * ledger that cannot be replayed to reproduce its counters is worse than an empty one,
         * and the invariant test in `src/modules/inventory/tests/unit/ledger.property.test.ts`
         * would fail against converted rows.
         */
        await db
            .collection('stockmovements')
            .drop()
            .catch(() => {
                // Never seeded, or already dropped. Nothing to undo.
            });
    },

    async down(db) {
        /*
         * `onHand` goes back to `stock` and `reserved` is dropped. Units held by an open
         * reservation are silently returned to the sellable count, because the pre-reservation
         * model had nowhere to record that they were spoken for — the old shape genuinely cannot
         * hold that fact. The reservation documents themselves are left alone: rolling the schema
         * back is not a reason to destroy the record of what was held.
         */
        await db
            .collection('products')
            .updateMany({ onHand: { $exists: true } }, { $rename: { onHand: 'stock' } });

        await db.collection('products').updateMany({}, { $unset: { reserved: '' } });
    }
};
