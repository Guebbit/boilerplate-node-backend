/**
 * @module
 * Controller for `POST /tickets/:id/notes` — a staff note, append-only.
 *
 * See: docs/modules/tickets.md
 */

import type { Request, Response } from 'express';
import { CreateTicketNoteBody } from '@api/schemas.zod';
import type { CreateTicketNoteRequest, Ticket } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { ticketService } from '../service';

/** POST /tickets/:id/notes (staff) */
export const postTicketNote = (
    request: Request<{ id: string }, unknown, CreateTicketNoteRequest>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return Promise.resolve();
    const body = parseBody(CreateTicketNoteBody, request.body, response);
    if (!body) return Promise.resolve();

    return ticketService
        .addNote(id, body.body, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Ticket>(response, result.data, 201);
        })
        .catch(catchAs(response, 'postTicketNote'));
};
