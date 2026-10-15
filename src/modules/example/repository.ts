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
import { imageWritebackFor } from '@infrastructure/persistence/image-writeback';
import {
    translatableColumnsOf,
    type TranslatableColumns
} from '@infrastructure/persistence/translatable-columns';

/**
 * The repository, written out as a type: Mongoose's generics are too large for TypeScript to
 * serialize an inferred one at an export boundary (TS7056).
 */
export const exampleRepository: Repository<ExampleDocument, ExampleRow> & {
    findScoped: (id: string, scope: Record<string, unknown>) => Promise<ExampleDocument | null>;
    deleteAllOf: (userId: string, session: ClientSession) => Promise<string[]>;
    translatable: TranslatableColumns;
    publishFrom: (
        id: string,
        before: ExampleDocument['status'],
        fields: Pick<ExampleDocument, 'title' | 'body' | 'status' | 'publishedAt'>,
        session: ClientSession
    ) => Promise<ExampleDocument | null>;
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
     * Move an example into published, but only while it still holds the status the caller read.
     * Two requests publishing one draft both read `draft`; only one write matches, so only one
     * of them announces.
     *
     * @param id - the example
     * @param before - the status the caller read; the write matches nothing if it has moved
     * @param fields - the edit to write: the new status, its text and the publish stamp
     * @param session - the publish's transaction, shared with the outbox row
     * @returns the saved example, or `null` when a peer changed the status first
     */
    publishFrom: (id, before, fields, session) =>
        exampleModel
            .findOneAndUpdate(
                { _id: toObjectId(id), status: before },
                { $set: fields },
                // `returnDocument: 'after'` answers the written row; `session` joins the transaction.
                // https://mongoosejs.com/docs/api/model.html#Model.findOneAndUpdate()
                { returnDocument: 'after', session }
            )
            .exec(),

    /**
     * The image pipeline's writeback — see `ImageTarget.writeback`. Matches on the pending key, so
     * a stale or repeated job changes nothing.
     */
    translatable: translatableColumnsOf(exampleModel),

    writebackImage: imageWritebackFor(exampleModel)
};
