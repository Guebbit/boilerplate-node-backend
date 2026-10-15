/**
 * @module
 * The three writes the `locales` translation port asks of an owning module, once, over its model:
 * does the entity exist, copy the fallback locale's fields onto its own columns, and stamp it as
 * edited. `products` and `example` both hand `locales` exactly these; each now builds them from its
 * own model instead of writing them out.
 *
 * Same shape as `reencryptOf(model)` in `../security/reencrypt.ts`: a function of the model.
 *
 * See: docs/modules/locales.md
 */

import type { ClientSession, Document, Model, QueryFilter, UpdateQuery } from 'mongoose';
import { toObjectId } from './create-repository';

/** What a collection offers the translation port; the shape `TranslatableTarget` asks for. */
export interface TranslatableColumns {
    /** Whether a document with this id exists, in any scope. */
    exists: (entityId: string) => Promise<boolean>;
    /**
     * Copies the fallback locale's fields onto the document's own columns, so a search or a list
     * never resolves a translation for the language the row is already in. A cleared field is an
     * empty column. `timestamps: false`: a derived copy is not an edit anybody made.
     */
    writeDerived: (
        entityId: string,
        fields: Record<string, string | null>,
        session?: ClientSession
    ) => Promise<void>;
    /**
     * Stamps the document as edited, so its version (the ETag) moves even when no column changed.
     * Written by hand with `timestamps: false`, since Mongoose adds no `$set` to an empty update.
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
    exists: async (entityId) =>
        (await model.exists({ _id: toObjectId(entityId) } as QueryFilter<TDocument>).exec()) !==
        null,

    writeDerived: (entityId, fields, session) =>
        model
            .updateOne(
                { _id: toObjectId(entityId) } as QueryFilter<TDocument>,
                // `as`: the column names arrive as data (the port's `fields`), which a generic
                // `TDocument` cannot show the compiler.
                {
                    $set: Object.fromEntries(
                        Object.entries(fields).map(([name, value]) => [name, value ?? ''])
                    )
                } as UpdateQuery<TDocument>,
                // `session` joins the caller's transaction; `undefined` stands alone.
                { timestamps: false, session }
            )
            .exec()
            .then(() => undefined),

    markEdited: (entityId, session) =>
        model
            .updateOne(
                { _id: toObjectId(entityId) } as QueryFilter<TDocument>,
                { $set: { updatedAt: new Date() } },
                { timestamps: false, session }
            )
            .exec()
            .then(() => undefined)
});
