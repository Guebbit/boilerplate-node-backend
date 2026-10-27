/**
 * @module
 * The three bodyless status doors — `POST /tickets/:id/resolve`, `/mark-spam`, `/reopen` — one
 * handler each, built from the same shape: read the id, run the door, answer 200 with the ticket.
 *
 * See: docs/modules/tickets.md
 */

import type { Request, Response } from 'express';
import type { Ticket } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { ticketService } from '../service';

/**
 * A handler for one door.
 *
 * @param name - the handler's name, for the log line and the module-surface docs
 * @param run - the service call this door makes
 */
const doorController =
    (name: string, run: (typeof ticketService)['resolve']) =>
    (request: Request<{ id: string }>, response: Response) => {
        const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
        if (!id) return Promise.resolve();

        return run(id, callerContextOf(request))
            .then((result) => {
                if (refused(response, result)) return;
                successResponse<Ticket>(response, result.data, 200);
            })
            .catch(catchAs(response, name));
    };

/** POST /tickets/:id/resolve (staff) */
export const postTicketResolve = doorController('postTicketResolve', ticketService.resolve);

/** POST /tickets/:id/mark-spam (staff) */
export const postTicketMarkSpam = doorController('postTicketMarkSpam', ticketService.markSpam);

/** POST /tickets/:id/reopen (staff) */
export const postTicketReopen = doorController('postTicketReopen', ticketService.reopen);
