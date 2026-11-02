/**
 * @module
 * Controller for `POST /tasks` — the one public write this module has, mounted above
 * the admin gate in `../routes` rather than exempted from it.
 *
 * See: docs/modules/tasks.md
 */

import type { Request, Response } from 'express';
import { CreateContactTaskBody } from '@api/schemas.zod';
import { trimmedInto } from '@infrastructure/http/schemas';
import { createdResponse } from '@infrastructure/http/response';
import type { CreateContactTaskRequest, Task } from '@types';
import { taskService } from '../service';
import { NO_ACTIONS, presentTask } from '../presenter';
import { catchAs, parseBody } from '@infrastructure/http/controller';

/**
 * The generated `CreateContactTaskBody` with each text field trimmed first, so whitespace
 * alone reads as empty. Every bound — the email's 254 cap included — is the contract's own, never
 * restated here.
 */
const createContactTaskSchema = CreateContactTaskBody.extend({
    name: trimmedInto(CreateContactTaskBody.shape.name.unwrap()).optional(),
    email: trimmedInto(CreateContactTaskBody.shape.email),
    subject: trimmedInto(CreateContactTaskBody.shape.subject),
    message: trimmedInto(CreateContactTaskBody.shape.message),
    orderNumber: trimmedInto(CreateContactTaskBody.shape.orderNumber.unwrap()).optional()
});

/**
 * POST /tasks (public; a signed-in sender is recognised)
 * Create a task and send an email notification to the configured contact mailbox.
 */
export const postTask = (
    request: Request<unknown, unknown, CreateContactTaskRequest>,
    response: Response
) => {
    const body = parseBody(createContactTaskSchema, request.body, response);
    if (!body) return;

    /*
     * The support notification is `taskService.create`'s: who gets told, and in which
     * language, are facts about the task rather than about the request that filed it.
     *
     * `authContext` is set only for a signed-in session (`getAuth` upstream; an expired token or no
     * token leaves it unset and the post goes through as anonymous). Its id becomes the task's
     * `subjectId`, so the export and the erasure follow the message to the account.
     */
    return taskService
        .create(body, request.authContext?.id)
        .then((createdTask) => {
            const taskRecord = presentTask(createdTask, NO_ACTIONS);
            createdResponse<Task>(response, taskRecord, `/tasks/${taskRecord.id}`);
        })
        .catch(catchAs(response, 'postTask'));
};
