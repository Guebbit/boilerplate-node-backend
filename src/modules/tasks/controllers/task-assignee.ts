/**
 * @module
 * `PUT /tasks/:id/assignee` (take or assign) and `DELETE /tasks/:id/assignee` (give back).
 *
 * See: docs/modules/tasks.md
 */

import type { Request, Response } from 'express';
import { AssignTaskBody } from '@api/schemas.zod';
import type { AssignTaskRequest, Task } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { taskService } from '../service';

/** PUT /tasks/:id/assignee (staff) — hand the task to one person; taking it is assigning yourself. */
export const putTaskAssignee = (
    request: Request<{ id: string }, unknown, AssignTaskRequest>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return Promise.resolve();
    const body = parseBody(AssignTaskBody, request.body, response);
    if (!body) return Promise.resolve();

    return taskService
        .assign(id, body.userId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Task>(response, result.data, 200);
        })
        .catch(catchAs(response, 'putTaskAssignee'));
};

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
