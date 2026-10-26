/**
 * @module
 * Controller for `GET /tickets/:id` — `read:Ticket`, one ticket of the admin queue.
 *
 * See: docs/modules/tickets.md
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { ticketService } from '../service';
import { presentTicket } from '../presenter';

/**
 * GET /tickets/:id (admin)
 * One ticket. A malformed or unknown id both answer 404.
 */
export const getTicketById = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'generic.error-not-found' });
    if (!id) return Promise.resolve();

    return ticketService
        .getById(id)
        .then((result) => {
            if (refused(response, result)) return;
            successResponse(response, presentTicket(result.data), 200);
        })
        .catch(catchAs(response, 'getTicketById'));
};
