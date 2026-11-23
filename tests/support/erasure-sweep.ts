/**
 * @module
 * The "no collection still names the erased account" sweep, shared by the erasure tests: the
 * generic one (`tests/integration/erasure.test.ts`) and the shop's (`tests/integration/erasure-shop.test.ts`).
 */
import mongoose from 'mongoose';

/**
 * A stored document flattened to lower-case text. An ObjectId serialises to its hex string, so a
 * deep scan finds an account whether the row holds it as a string or as an ObjectId.
 */
const textOf = (value: unknown): string => JSON.stringify(value).toLowerCase();

/**
 * The collections whose documents mention `needles`, by name. Reads every collection, so a home
 * nobody thought of is found too.
 * @param needles - lower-case ids and addresses to look for
 */
export const collectionsNaming = async (needles: readonly string[]): Promise<string[]> => {
    const database = mongoose.connection.db!;
    const listed = await database.listCollections().toArray();
    const names = listed.map(({ name }) => name);
    const hits: string[] = [];
    for (const name of names) {
        const documents = await database.collection(name).find({}).toArray();
        if (
            documents.some((document) =>
                needles.some((needle) => textOf(document).includes(needle))
            )
        )
            hits.push(name);
    }
    return hits.toSorted();
};

/**
 * Where the app may still name the account after the purge, each with its reason. An entry is an
 * argument: a collection added here is a decision to keep personal data, not a way to quiet a test.
 * The shop's own entries (orders, invoices) are added by the shop's test, so a build without the
 * shop is held to the shorter list.
 */
export const KEPT_BY_LAW = {
    // Art. 6(1)(c) and (f), recital 49: the trail of what happened keeps actor and target ids.
    auditlogs: 'audit window',
    // Published rows are kept seven days; the events carry ids only.
    outboxevents: 'outbox retention',
    /**
     * The `user.erased` delivery is the notice Art. 19 owes recipients. It carries the id only, no
     * email, and the delivery log expires on its own clock (30 days).
     */
    webhookdeliveries: 'delivery log retention',
    /**
     * Art. 5(2) and 17: proof the account was erased, so a backup restore re-erases it. Holds the
     * id only, and expires on NODE_ERASURE_LEDGER_RETENTION_DAYS.
     */
    erasureledgers: 'erasure proof, outlives backups'
} as const;
