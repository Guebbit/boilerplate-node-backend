/**
 * @module
 * The three writes the `locales` translation port asks of an owning module, once, over its model:
 * does the entity exist, copy the fallback locale's fields onto its own columns, and stamp it as
 * edited. `products` and `example` both hand `locales` exactly these; each now builds them from its
 * own model instead of writing them out.
 *
 * Same shape as `reencryptOf(model)` in `../security/reencrypt.ts`: a function of the model.
 *
 * @see docs/modules/locales.md#the-translations-collection
 */

import type { ClientSession, Document, Model, UpdateQuery } from 'mongoose';
import { clearedOrValue, setAndUnset } from './changes';
import { toObjectId } from './create-repository';
import { EDIT_REVISION } from './revision-plugin';
import { PreconditionFailedError, preconditionFilter } from './versioning';

/** What a collection offers the translation port; the shape `TranslatableTarget` asks for. */
export interface TranslatableColumns {
    /** The document's edit counter (`0` before its first edit), or `undefined` when none has this id; any scope. */
    revisionOf: (entityId: string) => Promise<number | undefined>;
    /**
     * Copies the fallback locale's fields onto the document's own columns, so a search or a list
     * never resolves a translation for the language the row is already in. A cleared field is no
     * field (`$unset`), the same as its translation row. `timestamps: false`: a derived copy is not an edit anybody made.
     */
    writeDerived: (
        entityId: string,
        fields: Record<string, string | null>,
        session?: ClientSession
    ) => Promise<void>;
    /**
     * Stamps the document as edited, so its version (the ETag) moves even when no column changed.
     * Written by hand with `timestamps: false`, since Mongoose adds no `$set` to an empty update.
     * Fenced on the request's `If-Match` when one names this row: nothing matched means the
     * owner's version moved since the caller read it.
     *
     * @throws {PreconditionFailedError} when the open precondition no longer matches
     */
    markEdited: (entityId: string, session?: ClientSession) => Promise<void>;
}

/**
 * The translation port's writes for one collection.
 *
 * @param model - the collection's model
 */
export const translatableColumnsOf = <TDocument extends Document>(
    model: Model<TDocument>
): TranslatableColumns => ({
    // `async` because `toObjectId` throws on a malformed id.
    revisionOf: async (entityId) => {
        const row = await model
            .findOne(
                { _id: toObjectId(entityId) },
                {
                    [EDIT_REVISION]: 1
                }
            )
            .lean<{ editRevision?: number }>()
            .exec();
        return row ? (row.editRevision ?? 0) : undefined;
    },

    writeDerived: (entityId, fields, session) =>
        model
            .updateOne(
                { _id: toObjectId(entityId) },
                /**
                 * `as`: the column names arrive as data (the port's `fields`), which a generic
                 * `TDocument` cannot show the compiler. A `null` becomes an `$unset`.
                 */
                setAndUnset(
                    Object.fromEntries(
                        Object.entries(fields).map(([name, value]) => [name, clearedOrValue(value)])
                    )
                ) as UpdateQuery<TDocument>,
                // `session` joins the caller's transaction; `undefined` stands alone.
                { timestamps: false, session }
            )
            .exec()
            .then(() => undefined),

    markEdited: (entityId, session) => {
        const fence = preconditionFilter(entityId, EDIT_REVISION);
        return model
            .updateOne(
                { _id: toObjectId(entityId), ...fence },
                // The revision plugin sees this `updatedAt` stamp and adds the `$inc` of the counter.
                { $set: { updatedAt: new Date() } },
                { timestamps: false, session }
            )
            .exec()
            .then(({ matchedCount }) => {
                if (matchedCount === 0 && Object.keys(fence).length > 0)
                    throw new PreconditionFailedError();
            });
    }
});
