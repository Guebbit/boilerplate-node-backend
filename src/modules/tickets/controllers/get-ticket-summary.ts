/**
 * @module
 * Controller for `GET /tickets/summary` — the staff badge's counts.
 *
 * See: docs/modules/tickets.md
 */

import type { Request, Response } from 'express';
import { successResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { catchAs } from '@infrastructure/http/controller';
import { ticketService } from '../service';

/** GET /tickets/summary (staff) */
export const getTicketSummary = (request: Request, response: Response) =>
    ticketService
        .summary(callerContextOf(request))
        .then((counts) => successResponse(response, counts, 200))
        .catch(catchAs(response, 'getTicketSummary'));
