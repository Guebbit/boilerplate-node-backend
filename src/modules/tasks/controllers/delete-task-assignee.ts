/**
 * @module
 * `DELETE /tasks/:id/assignee` (give back).
 *
 * See: docs/modules/tasks.md
 */

import type { Request, Response } from 'express';
import type { Task } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { taskService } from '../services';

/** DELETE /tasks/:id/assignee (staff) — give the task back. */
export const deleteTaskAssignee = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return Promise.resolve();

    return taskService
        .unassign(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Task>(response, result.data, 200);
        })
        .catch(catchAs(response, 'deleteTaskAssignee'));
};
