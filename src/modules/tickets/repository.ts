/**
 * @module
 * Ticket repository — standard CRUD via the shared repository factory.
 *
 * See: docs/modules/tickets.md
 */

import { ticketModel, applyTicketTransform } from './model';
import type { TicketDocument } from './model';
import { createRepository } from '@infrastructure/persistence/create-repository';
import type { Ticket } from '@types';

/**
 * `status` and `category` are deliberately absent from the search spec: each is a closed enum, and
 * mapping a raw string onto it is a domain decision the service makes before handing the result
 * down as a scope.
 */
export const ticketRepository = createRepository<TicketDocument, Ticket>(ticketModel, {
    transform: applyTicketTransform,
    searchable: {
        objectIds: { id: '_id' },
        regex: { email: 'email' },
        text: ['name', 'email', 'subject', 'message'],
        sortable: { createdAt: 'createdAt', status: 'status', email: 'email' }
    }
});
