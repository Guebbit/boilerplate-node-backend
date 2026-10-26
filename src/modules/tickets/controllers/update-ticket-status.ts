/**
 * @module
 * Controller for `PATCH /tickets/:id` (merge) — admin triage on a ticket's status and
 * notes, built on the shared `createPatchController` factory. There is no PUT: the body is two
 * fields of a bigger record, so it could never be the whole resource.
 *
 * See: docs/modules/tickets.md
 */

import { createPatchController } from '@infrastructure/surfaces/create-update-controller';
import { UpdateTicketStatusBody } from '@api/schemas.zod';
import { callerContextOf } from '@infrastructure/http/request';
import { ticketService } from '../service';
import { presentTicket } from '../presenter';

/** `PATCH /tickets/:id` — a handler over `updateStatusById`, which audits the change itself. */
export const updateTicketStatus = createPatchController({
    versioned: false,
    entity: 'ticketStatus',
    notFoundKey: 'generic.error-not-found',
    patchSchema: UpdateTicketStatusBody,
    update: (id, changes, request) =>
        ticketService.updateStatusById(id, changes, callerContextOf(request)),
    present: (row) => presentTicket(row)
});
