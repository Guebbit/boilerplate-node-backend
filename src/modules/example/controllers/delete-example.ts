/**
 * @module
 * In any module: a delete controller. Hand-written here because the shared delete factory serves
 * the soft/hard delete triplet, and this module has no soft-delete tier to flag. Here:
 * `DELETE /examples/:id`.
 *
 * See: docs/theory/request-flow.md
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { exampleService } from '../services';

/**
 * DELETE /examples/:id: permanently remove an example the caller may delete. A malformed or an
 * unknown id both answer 404, as does an example the caller may not delete.
 */
export const deleteExample = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'example.not-found' });
    if (!id) return Promise.resolve();

    return exampleService
        .remove(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, undefined, 200, result.message);
        })
        .catch(catchAs(response, 'deleteExample'));
};
