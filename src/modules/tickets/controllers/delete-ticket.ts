/**
 * @module
 * Controller for `DELETE /tickets/:id` — `delete:Ticket`, permanent. Hand-written rather than built
 * on `createDeleteController`: that factory exists for the soft/hard delete triplet, and this
 * module has no soft-delete tier.
 *
 * See: docs/modules/tickets.md
 */

import type { Request, Response } from 'express';
import { noContentResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { ticketService } from '../service';

/**
 * DELETE /tickets/:id (staff)
 * Permanently removes a ticket. A malformed, unknown or out-of-jurisdiction id answers 404.
 */
export const deleteTicket = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'generic.error-not-found' });
    if (!id) return Promise.resolve();

    return ticketService
        .removeById(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            noContentResponse(response);
        })
        .catch(catchAs(response, 'deleteTicket'));
};
