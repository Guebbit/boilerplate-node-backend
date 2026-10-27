/**
 * @module
 * The one atomic "move it only if it is still in X" write behind every module lifecycle.
 *
 * Why it is shared: the condition must ride in the FILTER, never in a read before the write. A copy
 * that forgets `status` in the filter is a silent double-ship or double-refund.
 *
 * See: docs/theory/tactical-ddd.md#deciding-and-enforcing-stay-separate
 */

import type { ClientSession, HydratedDocument, Model, QueryFilter } from 'mongoose';

/** What a caller may add to the write beyond the status move itself. */
export interface ConditionalStatusOptions {
    /** Facts that belong to this move (`paidAt`, `committedAt`…), written in the SAME statement. */
    set?: Record<string, unknown>;
    /** Joins the write to the caller's transaction, so an outbox row rides with it. */
    session?: ClientSession | null;
}

/**
 * Set `status = to` on the one document `match` selects, but only while its status is still one of
 * `from`. Two racing writes both pass a read; mongod evaluates the filter while holding the
 * document, so exactly one matches and the other gets `null`.
 *
 * @param model - the collection to write
 * @param match - what selects the document: its `_id` or `orderId`, plus any scope filter
 * @param from - the statuses the move may start from
 * @param to - the status being written
 * @param options - stamps to write in the same statement, and the caller's transaction
 * @returns the document as it now stands, or `null` when it was not in `from` (or not matched)
 */
export const updateStatusIfIn = <TDocument>(
    model: Model<TDocument>,
    match: Record<string, unknown>,
    from: readonly string[],
    to: string,
    { set = {}, session }: ConditionalStatusOptions = {}
): Promise<HydratedDocument<TDocument> | null> =>
    model
        .findOneAndUpdate(
            // `as QueryFilter`: spreading a `Record<string, unknown>` widens the object past what the
            // filter generic accepts, and typing every caller's scope per collection buys nothing.
            { ...match, status: { $in: [...from] } } as QueryFilter<TDocument>,
            { $set: { ...set, status: to } },
            // `returnDocument: 'after'` answers the written row; `session` joins the transaction.
            // https://mongoosejs.com/docs/api/model.html#Model.findOneAndUpdate()
            { returnDocument: 'after', ...(session ? { session } : {}) }
        )
        .exec();
