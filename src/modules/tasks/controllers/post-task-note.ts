/**
 * @module
 * Controller for `POST /tasks/:id/notes` — a staff note, append-only.
 *
 * See: docs/modules/tasks.md
 */

import type { Request, Response } from 'express';
import { CreateTaskNoteBody } from '@api/schemas.zod';
import type { CreateTaskNoteRequest, Task } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { trimmedInto } from '@infrastructure/http/schemas';
import { taskService } from '../service';

/** The note body trimmed first, so whitespace alone is the field-level 422 an empty one is. */
const createTrimmedNoteBody = CreateTaskNoteBody.extend({
    body: trimmedInto(CreateTaskNoteBody.shape.body)
});

/** POST /tasks/:id/notes (staff) */
export const postTaskNote = (
    request: Request<{ id: string }, unknown, CreateTaskNoteRequest>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return Promise.resolve();
    const body = parseBody(createTrimmedNoteBody, request.body, response);
    if (!body) return Promise.resolve();

    return taskService
        .addNote(id, body.body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Task>(response, result.data, 200);
        })
        .catch(catchAs(response, 'postTaskNote'));
};
