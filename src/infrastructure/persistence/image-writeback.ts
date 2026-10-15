/**
 * @module
 * The image digest pipeline's writeback, once, for every collection that holds a picture. The
 * pipeline (`image.worker.ts`) sits below the modules and cannot import a model, so each module
 * hands it this function built over its own: `writebackImage: imageWritebackFor(userModel)`.
 *
 * See: docs/tools/image-processing.md
 */

import type { Document, Model, QueryFilter } from 'mongoose';
import type { ImageWriteback } from '@infrastructure/adapters/image.worker';
import { toObjectId } from './create-repository';

/**
 * The writeback for one collection. Conditional on `pendingImageKey` still matching `key`, so a
 * stale or duplicate job delivery cannot overwrite a later upload, and a hard-deleted document is a
 * detectable miss rather than a write to nothing. `timestamps: false`: the digest finishing is not
 * an edit anybody made.
 *
 * A miss may be a duplicate run of the same job, whose twin already wrote these exact urls. That
 * counts as held, or the caller deletes the live files.
 *
 * @param model - the collection's model; its documents carry `pendingImageKey`, `imageUrl` and
 *   `thumbnailUrl`
 */
export const imageWritebackFor =
    <TDocument extends Document>(model: Model<TDocument>): ImageWriteback =>
    (documentId, key, urls) =>
        model
            .updateOne(
                // `as`: the filter and update name the three image fields every image-bearing
                // schema carries, which a generic `TDocument` cannot show the compiler.
                { _id: toObjectId(documentId), pendingImageKey: key } as QueryFilter<TDocument>,
                {
                    $set: { imageUrl: urls.imageUrl, thumbnailUrl: urls.thumbnailUrl },
                    $unset: { pendingImageKey: '' }
                },
                { timestamps: false }
            )
            .exec()
            .then(({ matchedCount }) =>
                matchedCount > 0
                    ? true
                    : model
                          .exists({
                              _id: toObjectId(documentId),
                              imageUrl: urls.imageUrl
                          } as QueryFilter<TDocument>)
                          .exec()
                          .then((held) => held !== null)
            );
