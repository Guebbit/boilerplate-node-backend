/**
 * @module
 * Controller for `GET /tasks/:id` — one task of the staff queue, inside the caller's
 * jurisdiction. Reading a visitor's task is audited: it names a person.
 *
 * See: docs/modules/tasks.md
 */

import type { Request, Response } from 'express';
import { TaskSource } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { recordStaffRead } from '@kernel/staff-read';
import { tasksAuditActions } from '../audit';
import { taskService } from '../service';

/**
 * GET /tasks/:id (staff)
 * One task. A malformed, unknown or out-of-jurisdiction id all answer 404.
 */
export const getTaskById = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return Promise.resolve();

    return taskService
        .getById(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            if (result.data.source === TaskSource.visitor)
                recordStaffRead(request, {
                    key: 'read:Task',
                    action: tasksAuditActions.ADMIN_TASK_VIEWED,
                    targetType: 'task',
                    targetId: id,
                    ownerId: result.data.subjectId
                });
            successResponse(response, result.data, 200);
        })
        .catch(catchAs(response, 'getTaskById'));
};
