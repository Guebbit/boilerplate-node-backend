/**
 * @module
 * What the `locales` translation port asks of an owning module, once, over its model: does the
 * entity exist, what is its own default-language text, and stamp it as edited. `products` and
 * `example` both hand `locales` exactly these; each builds them from its own model instead of
 * writing them out.
 *
 * Same shape as `reencryptOf(model)` in `../security/reencrypt.ts`: a function of the model.
 *
 * @see docs/modules/locales.md#the-translations-collection
 */

import type { ClientSession, Document, Model } from 'mongoose';
import { toObjectId } from './create-repository';
import { EDIT_REVISION } from './revision-plugin';
import { PreconditionFailedError, preconditionFilter } from './versioning';

/** What a collection offers the translation port; the shape `TranslatableTarget` asks for. */
export interface TranslatableColumns {
    /** The document's edit counter (`0` before its first edit), or `undefined` when none has this id; any scope. */
    revisionOf: (entityId: string) => Promise<number | undefined>;
    /**
     * The document's own text for the named columns: the default language, which every
     * translation row is a copy of. A column the document has no string for is left out, never
     * `''`, so the same text always digests the same. `undefined` when none has this id.
     */
    sourceOf: (
        entityId: string,
        fields: readonly string[],
        session?: ClientSession
    ) => Promise<Record<string, string> | undefined>;
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

    sourceOf: async (entityId, fields, session) => {
        // `session` joins the caller's transaction, so a write just made inside it is read back.
        const row = await model
            .findOne(
                { _id: toObjectId(entityId) },
                // A projection by name: the columns arrive as data, which a generic `TDocument` cannot show.
                Object.fromEntries(fields.map((field) => [field, 1]))
            )
            .session(session ?? null)
            .lean<Record<string, unknown>>()
            .exec();
        if (!row) return undefined;
        // `typeof` keeps a column that holds no string (absent, or a stray value) out of the source.
        return Object.fromEntries(
            fields.flatMap((field) => {
                const value = row[field];
                return typeof value === 'string' ? [[field, value]] : [];
            })
        );
    },

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
