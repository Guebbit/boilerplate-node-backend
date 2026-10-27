/**
 * @module
 * Controller for `GET /tickets/:id` — one ticket of the staff queue, inside the caller's
 * jurisdiction. Reading a visitor's ticket is audited: it names a person.
 *
 * See: docs/modules/tickets.md
 */

import type { Request, Response } from 'express';
import { TicketSource } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs, refused } from '@infrastructure/http/controller';
import { requireId } from '@infrastructure/http/ids';
import { recordStaffRead } from '@kernel/staff-read';
import { ticketsAuditActions } from '../audit';
import { ticketService } from '../service';

/**
 * GET /tickets/:id (staff)
 * One ticket. A malformed, unknown or out-of-jurisdiction id all answer 404.
 */
export const getTicketById = (request: Request<{ id: string }>, response: Response) => {
    const id = requireId(request, response, { notFound: 'generic.error-item-gone' });
    if (!id) return Promise.resolve();

    return ticketService
        .getById(id, callerContextOf(request))
        .then((result) => {
            if (refused(response, result)) return;
            if (result.data.source === TicketSource.visitor)
                recordStaffRead(request, {
                    key: 'read:Ticket',
                    action: ticketsAuditActions.ADMIN_TICKET_VIEWED,
                    targetType: 'ticket',
                    targetId: id,
                    ownerId: result.data.subjectId
                });
            successResponse(response, result.data, 200);
        })
        .catch(catchAs(response, 'getTicketById'));
};
