/**
 * @module
 * The three bodyless status doors — `POST /tasks/:id/resolve`, `/mark-spam`, `/reopen` — one
 * handler each, built from the same shape: read the id, run the door, answer 200 with the task.
 *
 * See: docs/modules/tasks.md
 */

import type { Request, Response } from 'express';
import type { Task } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { taskService } from '../service';

/**
 * A handler for one door.
 *
 * @param name - the handler's name, for the log line and the module-surface docs
 * @param run - the service call this door makes
 */
const doorController =
    (name: string, run: (typeof taskService)['resolve']) =>
    (request: Request<{ id: string }>, response: Response) => {
        const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
        if (!id) return Promise.resolve();

        return run(id, callerContextOf(request))
            .then((result) => {
                if (refused(response, result)) return;
                successResponse<Task>(response, result.data, 200);
            })
            .catch(catchAs(response, name));
    };

/** POST /tasks/:id/resolve (staff) */
export const postTaskResolve = doorController('postTaskResolve', taskService.resolve);

/** POST /tasks/:id/mark-spam (staff) */
export const postTaskMarkSpam = doorController('postTaskMarkSpam', taskService.markSpam);

/** POST /tasks/:id/reopen (staff) */
export const postTaskReopen = doorController('postTaskReopen', taskService.reopen);
