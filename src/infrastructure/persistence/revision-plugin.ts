/**
 * @module
 * The edit counter of a versioned row: `editRevision`, an integer every edit moves by an atomic
 * `$inc`. It is the row's version — the `ETag` is derived from it, `If-Match` is compared with it.
 *
 * ```
 * save()        → pre-save hook flags the write → Mongoose sends  { $inc: { editRevision: 1 } }
 * updateOne …   → pre-update hook adds           →                { $inc: { editRevision: 1 } }
 * timestamps:false (stock mirror, digest, session tokens)  →  no stamp, so no increment
 * ```
 *
 * The rule is "the counter moves wherever `updatedAt` moves": a write that is not an editor's
 * edit already opts out of Mongoose's `timestamps`, and so out of the counter, in the one place it
 * does; an edit that changes nothing on the row stamps `updatedAt` by hand and moves it too. A counter, not `updatedAt`, because RFC 9110 §8.8.1 wants a strong validator to
 * change on every change — two edits in one millisecond share a timestamp but never a counter.
 *
 * See: docs/api/write-methods.md#what-the-tag-is
 */

import { Document, type Query, type Schema } from 'mongoose';

/**
 * The path that holds the counter. Not `revision`: `locales` already owns a wire field of that
 * name, with another meaning.
 */
export const EDIT_REVISION = 'editRevision';

/**
 * Mongoose's flag for "send `$inc` on the version key, add no version filter" (the other half,
 * `VERSION_WHERE`, is what makes a write fail when the row moved). Read off the class instead of
 * hard-coded, so a renumbering cannot silently turn this into a different flag.
 */
const VERSION_INC: unknown = Reflect.get(Document, 'VERSION_INC');

/**
 * Whether `value` is a plain bag whose properties can be read and written.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/**
 * Makes the next `save()` of `document` send `$inc: { editRevision: 1 }`.
 *
 * Mongoose has no public door for an increment WITHOUT a version filter: `Document#increment()`
 * sets both flags, so every save would then fail when the row moved — which turns "no
 * `If-Match`, last writer wins" into an error. The private `$__.version` bit field is the only
 * place the two are separate. The tests in `tests/integration/persistence/revision.test.ts`
 * fail loudly if a Mongoose upgrade moves it.
 *
 * @param document - the document about to be saved
 * @throws {Error} when Mongoose no longer keeps the flag where this expects it
 */
const flagIncrement = (document: Document): void => {
    const internals: unknown = Reflect.get(document, '$__');
    if (!isRecord(internals) || typeof VERSION_INC !== 'number')
        throw new Error('Mongoose changed how it versions a save: revision-plugin must follow');
    const current = typeof internals.version === 'number' ? internals.version : 0;
    internals.version = current | VERSION_INC;
};

/**
 * Whether a query update stamps `updatedAt`: the `$set` Mongoose's timestamps hook adds to an
 * edit (a stage, for a pipeline update), or one a caller wrote by hand.
 */
const stampsUpdatedAt = (update: unknown): boolean => {
    const setters = (Array.isArray(update) ? update : [update]).map((step: unknown) =>
        isRecord(step) ? step.$set : undefined
    );
    return setters.some((setter) => isRecord(setter) && 'updatedAt' in setter);
};

/**
 * Adds the counter's increment to a query update that is an edit, whichever of Mongoose's forms
 * it is in.
 *
 * "An edit" is what Mongoose's own timestamps hook (registered when the schema was built, so it
 * has already run) decided to stamp: it skips the update when the caller passed
 * `timestamps: false`, which is how a stock mirror or a session token says "not an edit". The
 * options bag is not consulted — Mongoose keeps that flag private to the query.
 */
function incrementOnUpdate(this: Query<unknown, unknown>): void {
    const update: unknown = this.getUpdate();
    if (!stampsUpdatedAt(update)) return;

    if (Array.isArray(update)) {
        // A pipeline update has no `$inc`; the same step is a `$set` stage. `$ifNull` covers a row
        // that has no counter yet.
        this.setUpdate([
            ...(update as unknown[]),
            { $set: { [EDIT_REVISION]: { $add: [{ $ifNull: [`$${EDIT_REVISION}`, 0] }, 1] } } }
        ]);
        return;
    }
    const operators = isRecord(update) ? update : {};
    const inc = isRecord(operators.$inc) ? operators.$inc : {};
    this.setUpdate({ ...operators, $inc: { ...inc, [EDIT_REVISION]: 1 } });
}

/**
 * Mongoose plugin: gives a schema the `editRevision` counter and moves it on every edit.
 *
 * Apply it to a schema that has `timestamps: true`, after construction: the hooks read what that
 * option did (`updatedAt` stamped) to tell an edit from bookkeeping.
 *
 * @param schema - the schema to version
 */
export const revisionPlugin = (schema: Schema): void => {
    // The version key is Mongoose's own counter slot: it is created at 0, sent as `$inc`, and
    // incremented in memory after the write. Replaces `__v` on this schema.
    schema.set('versionKey', EDIT_REVISION);

    schema.pre('save', function flagEdit(this: Document) {
        // `updatedAt` is stamped by Mongoose's timestamps hook (registered when the schema was
        // built, so it runs first) exactly when this save is an edit of an existing row.
        if (!this.isNew && this.isModified('updatedAt')) flagIncrement(this);
    });

    // Document `updateOne`/`deleteOne` are not hooked: only the Model/Query forms are used.
    schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], incrementOnUpdate);
};
