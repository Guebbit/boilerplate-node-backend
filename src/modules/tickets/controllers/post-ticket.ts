/**
 * @module
 * Controller for `POST /tickets` — the one public write this module has, mounted above
 * the admin gate in `../routes` rather than exempted from it.
 *
 * See: docs/modules/tickets.md
 */

import type { Request, Response } from 'express';
import { CreateContactTicketBody } from '@api/schemas.zod';
import { trimmedInto } from '@infrastructure/http/schemas';
import { createdResponse } from '@infrastructure/http/response';
import type { CreateContactTicketRequest, Ticket } from '@types';
import { ticketService } from '../service';
import { presentTicket } from '../presenter';
import { catchAs, parseBody } from '@infrastructure/http/controller';

/**
 * The generated `CreateContactTicketBody` with each text field trimmed first, so whitespace
 * alone reads as empty. Every bound — the email's 254 cap included — is the contract's own, never
 * restated here.
 */
const createContactTicketSchema = CreateContactTicketBody.extend({
    name: trimmedInto(CreateContactTicketBody.shape.name.unwrap()).optional(),
    email: trimmedInto(CreateContactTicketBody.shape.email),
    subject: trimmedInto(CreateContactTicketBody.shape.subject),
    message: trimmedInto(CreateContactTicketBody.shape.message)
});

/**
 * POST /tickets (public)
 * Create a ticket and send an email notification to the configured contact mailbox.
 */
export const postTicket = (
    request: Request<unknown, unknown, CreateContactTicketRequest>,
    response: Response
) => {
    const body = parseBody(createContactTicketSchema, request.body, response);
    if (!body) return;

    /*
     * The support notification is `ticketService.create`'s: who gets told, and in which
     * language, are facts about the ticket rather than about the request that filed it.
     */
    return ticketService
        .create(body)
        .then((createdTicket) => {
            const ticketRecord = presentTicket(createdTicket);
            createdResponse<Ticket>(response, ticketRecord, `/tickets/${ticketRecord.id}`);
        })
        .catch(catchAs(response, 'postTicket'));
};
