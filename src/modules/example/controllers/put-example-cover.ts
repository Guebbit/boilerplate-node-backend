/**
 * @module
 * In any module: an upload controller reads what the upload middleware left on the request and
 * hands it to the service. Here: `PUT /examples/:id/cover`.
 * Delete it if: the module has no upload (with `services/cover.ts`, the route and the contract path).
 *
 * See: docs/tools/image-processing.md
 */

import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { requireId } from '@infrastructure/http/ids';
import { claimUpload, readUploadedImage } from '@infrastructure/http/uploads';
import { t } from '@infrastructure/i18n';
import { catchAs, namedHandler, refused } from '@infrastructure/http/controller';
import { exampleService } from '../services';

/** PUT /examples/:id/cover — replace the cover with the uploaded image. */
export const putExampleCover = namedHandler(
    'putExampleCover',
    (request: Request, response: Response) => {
        const id = requireId(request, response, { notFound: 'example.not-found' });
        if (!id) return Promise.resolve();

        const { imageUrl, thumbnailUrl, pendingImageKey } = readUploadedImage(request);

        // No file means nothing to set: a body-only `imageUrl: null` is not a way to clear a cover here.
        if (typeof imageUrl !== 'string') {
            rejectResponse(response, 422, [t('example.cover-missing')]);
            return Promise.resolve();
        }

        // Unclaimed unless the write succeeds: the upload middleware's close hook deletes an
        // upload whose request ended 4xx/5xx, so no branch here has to.
        return exampleService
            .setCover(id, { imageUrl, thumbnailUrl, pendingImageKey }, callerContextOf(request))
            .then((result) => {
                if (refused(response, result)) return;
                claimUpload(request);
                successResponse(response, result.data, 200, result.message);
            })
            .catch(catchAs(response, 'putExampleCover'));
    }
);
