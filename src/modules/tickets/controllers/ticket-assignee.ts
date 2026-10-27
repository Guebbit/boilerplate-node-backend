/**
 * @module
 * `PUT /tickets/:id/assignee` (take or assign) and `DELETE /tickets/:id/assignee` (give back).
 *
 * See: docs/modules/tickets.md
 */

import type { Request, Response } from 'express';
import { AssignTicketBody } from '@api/schemas.zod';
import type { AssignTicketRequest, Ticket } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, parseBody, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { ticketService } from '../service';

/** PUT /tickets/:id/assignee (staff) — hand the ticket to one person; taking it is assigning yourself. */
export const putTicketAssignee = (
    request: Request<{ id: string }, unknown, AssignTicketRequest>,
    response: Response
) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return Promise.resolve();
    const body = parseBody(AssignTicketBody, request.body, response);
    if (!body) return Promise.resolve();

    return ticketService
        .assign(id, body.userId, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Ticket>(response, result.data, 200);
        })
        .catch(catchAs(response, 'putTicketAssignee'));
};

/** DELETE /tickets/:id/assignee (staff) — give the ticket back. */
export const deleteTicketAssignee = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return Promise.resolve();

    return ticketService
        .unassign(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            successResponse<Ticket>(response, result.data, 200);
        })
        .catch(catchAs(response, 'deleteTicketAssignee'));
};
