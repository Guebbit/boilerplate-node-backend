/**
 * @module
 * Controller for `DELETE /tasks/:id` — `delete:Task`, permanent. Hand-written rather than built
 * on `createDeleteController`: that factory exists for the soft/hard delete triplet, and this
 * module has no soft-delete tier.
 *
 * See: docs/modules/tasks.md
 */

import type { Request, Response } from 'express';
import { noContentResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { taskService } from '../service';

/**
 * DELETE /tasks/:id (staff)
 * Permanently removes a task. A malformed, unknown or out-of-jurisdiction id answers 404.
 */
export const deleteTask = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return Promise.resolve();

    return taskService
        .removeById(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            noContentResponse(response);
        })
        .catch(catchAs(response, 'deleteTask'));
};
