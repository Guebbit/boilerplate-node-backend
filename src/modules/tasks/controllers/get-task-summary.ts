/**
 * @module
 * Controller for `GET /tasks/summary` — the staff badge's counts.
 *
 * See: docs/modules/tasks.md
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';
import { taskService } from '../service';

/** GET /tasks/summary (staff) */
export const getTaskSummary = (request: Request, response: Response) =>
    taskService
        .summary(callerContextOf(request))
        .then((counts) => successResponse(response, counts, 200))
        .catch(catchAs(response, 'getTaskSummary'));
