/**
 * @module
 * In any module: a delete controller. Hand-written here because the shared delete factory serves
 * the soft/hard delete triplet, and this module has no soft-delete tier to flag. Here:
 * `DELETE /examples/:id`.
 *
 * See: docs/theory/request-flow.md
 */

import type { Request, Response } from 'express';
import { noContentResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { withIfMatch } from '@infrastructure/http/preconditions';
import { exampleService } from '../services';

/**
 * DELETE /examples/:id: permanently remove an example the caller may delete. A malformed or an
 * unknown id both answer 404, as does an example the caller may not delete. An `If-Match` on the
 * request fences the delete: a stale tag answers 412 (the resource is `x-versioned`).
 */
export const deleteExample = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'example.not-found' });
    if (!id) return Promise.resolve();

    return withIfMatch(request, id, () => exampleService.removeById(id, callerContextOf(request)))
        .then((result) => {
            if (refused(response, result)) return;
            noContentResponse(response);
        })
        .catch(catchAs(response, 'deleteExample'));
};
