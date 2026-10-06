/**
 * @module
 * In any module: the only door to the collection. CRUD and search come from the shared factory;
 * what is added here is what this collection alone needs. Nothing outside the module imports it —
 * the service is the door. Here: translation, image and erasure writes beside the plain CRUD.
 *
 * See: docs/theory/layers.md
 */

import type { ClientSession } from 'mongoose';
import {
    exampleModel,
    applyExampleTransform,
    type ExampleDocument,
    type ExampleRow
} from './model';
import {
    createRepository,
    toObjectId,
    type Repository
} from '@infrastructure/persistence/create-repository';
import type { ImageWriteback } from '@infrastructure/adapters/image.worker';

/**
 * The repository, written out as a type: Mongoose's generics are too large for TypeScript to
 * serialize an inferred one at an export boundary (TS7056).
 */
export const exampleRepository: Repository<ExampleDocument, ExampleRow> & {
    findScoped: (id: string, scope: Record<string, unknown>) => Promise<ExampleDocument | null>;
    deleteAllOf: (userId: string, session: ClientSession) => Promise<string[]>;
    existsById: (id: string) => Promise<boolean>;
    writeTranslatedFields: (
        id: string,
        fields: Record<string, string | null>,
        session?: ClientSession
    ) => Promise<void>;
    markEdited: (id: string) => Promise<void>;
    writebackImage: ImageWriteback;
} = {
    ...createRepository<ExampleDocument, ExampleRow>(exampleModel, {
        transform: applyExampleTransform,
        // What `search` accepts. `status` is left out on purpose: it is a closed enum, so the
        // service passes it as a scope rather than a free filter.
        searchable: {
            objectIds: { id: '_id' },
            text: ['title', 'body'],
            sortable: { createdAt: 'createdAt', title: 'title', status: 'status' }
        }
    }),

    /**
     * One example by id, narrowed by an authorization scope in the same query — checking
     * visibility after the read is how a scoped find turns into an information leak. `async`
     * because `toObjectId` throws on a malformed id.
     *
     * @param id - the example's id
     * @param scope - the filter fragment the caller's keys compile to
     */
    findScoped: async (id, scope) => exampleModel.findOne({ _id: toObjectId(id), ...scope }).exec(),

    /**
     * Delete everything one user owns, inside the caller's transaction.
     *
     * @param userId - the owner
     * @param session - the hard delete's transaction; every write here must take it
     * @returns the cover images the deleted rows pointed at, for the caller to remove once the
     *   transaction has committed
     */
    deleteAllOf: (userId, session) =>
        exampleModel
            .find({ userId: toObjectId(userId), imageUrl: { $exists: true } }, { imageUrl: 1 })
            .session(session)
            .lean()
            .exec()
            .then((withCover) =>
                exampleModel
                    .deleteMany({ userId: toObjectId(userId) }, { session })
                    .exec()
                    .then(() => withCover.flatMap((row) => (row.imageUrl ? [row.imageUrl] : [])))
            ),

    /**
     * The `locales` port's existence check — see `TranslatableTarget.exists`.
     *
     * @param id - the id as it arrived on the path
     */
    existsById: async (id) => (await exampleModel.exists({ _id: toObjectId(id) }).exec()) !== null,

    /**
     * The `locales` port's writeback: copies the fallback-language title onto this document's own
     * column, so a list never resolves a translation for the language the row is already in.
     * `timestamps: false`: a derived copy is not an edit the owner made.
     *
     * @param id - the example
     * @param fields - the fallback locale's fields; `null` clears one
     */
    writeTranslatedFields: (id, fields, session) =>
        exampleModel
            .updateOne(
                { _id: toObjectId(id) },
                {
                    $set: Object.fromEntries(
                        Object.entries(fields).map(([key, value]) => [key, value ?? ''])
                    )
                },
                // `session` joins the caller's transaction; `undefined` stands alone.
                { timestamps: false, session }
            )
            .exec()
            .then(() => undefined),

    /**
     * The `locales` port's `markEdited`: a translation edit is an edit, so the version (the ETag)
     * moves even when no column changed. The hand-written `updatedAt` stamp is what the edit
     * counter reads (`persistence/revision-plugin`).
     *
     * @param id - the example whose translations were just written
     */
    markEdited: (id) =>
        exampleModel
            .updateOne(
                { _id: toObjectId(id) },
                { $set: { updatedAt: new Date() } },
                { timestamps: false }
            )
            .exec()
            .then(() => undefined),

    /**
     * The image pipeline's writeback — see `ImageTarget.writeback`. Matches on the pending key, so
     * a stale or repeated job changes nothing.
     */
    writebackImage: (documentId, key, urls) =>
        exampleModel
            .updateOne(
                { _id: toObjectId(documentId), pendingImageKey: key },
                {
                    $set: { imageUrl: urls.imageUrl, thumbnailUrl: urls.thumbnailUrl },
                    $unset: { pendingImageKey: '' }
                },
                { timestamps: false }
            )
            .exec()
            .then(({ matchedCount }) =>
                // A miss may be a repeat of the same job whose twin already wrote these urls: that
                // counts as held, or the caller deletes the live files.
                matchedCount > 0
                    ? true
                    : exampleModel
                          .exists({ _id: toObjectId(documentId), imageUrl: urls.imageUrl })
                          .exec()
                          .then((held) => held !== null)
            )
};
