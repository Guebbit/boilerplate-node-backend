/**
 * @module
 * Optional capability, in its own files: the cover-image upload. The upload middleware has already
 * run (see `routes.ts`); this reads what it left on the request. Here: `PUT /examples/:id/cover`.
 *
 * See: docs/tools/image-processing.md
 */

import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { readUploadedImage } from '@infrastructure/http/uploads';
import { t } from '@infrastructure/i18n';
import { catchAs, namedHandler, refused } from '@infrastructure/http/controller';
import { exampleService } from '../services';

/** PUT /examples/:id/cover — replace the cover with the uploaded image. */
export const putExampleCover = namedHandler(
    'putExampleCover',
    (request: Request, response: Response) => {
        const id = requireId(request, response, { notFound: 'example.not-found' });
        if (!id) return Promise.resolve();

        const { imageUrl, thumbnailUrl, pendingImageKey, deleteUpload } =
            readUploadedImage(request);

        // No file means nothing to set: a body-only `imageUrl: null` is not a way to clear a cover here.
        if (typeof imageUrl !== 'string') {
            rejectResponse(response, 422, [t('example.cover-missing')]);
            return Promise.resolve();
        }

        // An upload nothing references is an orphan, so every way out but success deletes it.
        const discard = (): Promise<unknown> => deleteUpload().catch(() => undefined);

        return exampleService
            .setCover(id, { imageUrl, thumbnailUrl, pendingImageKey }, callerContextOf(request))
            .then((result) => {
                if (refused(response, result)) return discard();
                successResponse(response, result.data, 200, result.message);
            })
            .catch((error: unknown) =>
                discard().then(() => {
                    catchAs(response, 'putExampleCover')(error);
                })
            );
    }
);
