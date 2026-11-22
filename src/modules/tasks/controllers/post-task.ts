/**
 * @module
 * Controller for `POST /tasks` — the one public write this module has, mounted above
 * the admin gate in `../routes` rather than exempted from it.
 *
 * @see docs/modules/tasks.md#the-story
 */

import type { Request, Response } from 'express';
import { CreateContactTaskBody } from '@api/schemas.zod';
import { trimmedInto } from '@infrastructure/http/schemas';
import { acceptedResponse } from '@infrastructure/http/response';
import type { CreateContactTaskRequest } from '@types';
import { taskService } from '../services';
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
 * Create a contact task. Answers `202` with no body: the message is stored and queued for the
 * main mailbox, so there is nothing to hand back.
 */
export const postTask = (
    request: Request<unknown, unknown, CreateContactTaskRequest>,
    response: Response
) => {
    const body = parseBody(createContactTaskSchema, request.body, response);
    if (!body) return;

    /**
     * The support notification is `taskService.submit`'s: who gets told, and in which
     * language, are facts about the task rather than about the request that filed it.
     *
     * `authContext` is set only for a signed-in session (`getAuth` upstream; an expired token or no
     * token leaves it unset and the post goes through as anonymous). Its id becomes the task's
     * `subjectId`, so the export and the erasure follow the message to the account.
     */
    return taskService
        .submit(body, request.authContext?.id)
        .then(() => acceptedResponse(response))
        .catch(catchAs(response, 'postTask'));
};
