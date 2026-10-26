/**
 * @module
 * Ticket repository — standard CRUD via the shared repository factory, plus the one bulk delete
 * the erasure needs.
 *
 * See: docs/modules/tickets.md
 */

import type { ClientSession } from 'mongoose';
import { ticketModel, applyTicketTransform } from './model';
import type { TicketDocument } from './model';
import { createRepository, type Repository } from '@infrastructure/persistence/create-repository';
import type { Ticket } from '@types';
import type { OwnTicketsFilter } from './domain';

/**
 * `status` and `category` are deliberately absent from the search spec: each is a closed enum, and
 * mapping a raw string onto it is a domain decision the service makes before handing the result
 * down as a scope.
 */
const base = createRepository<TicketDocument, Ticket>(ticketModel, {
    transform: applyTicketTransform,
    searchable: {
        objectIds: { id: '_id' },
        regex: { email: 'email' },
        text: ['name', 'email', 'subject', 'message'],
        sortable: { createdAt: 'createdAt', status: 'status', email: 'email' }
    }
});

/** The standard repository, plus the erasure's bulk delete. */
export type TicketRepository = Repository<TicketDocument, Ticket> & {
    deleteOwned: (filter: OwnTicketsFilter, session: ClientSession) => Promise<number>;
};

/** The standard repository, plus `deleteOwned`. */
export const ticketRepository: TicketRepository = {
    ...base,

    /**
     * Delete every ticket a person owns, inside the erasure's transaction.
     *
     * @param filter - from `ownTicketsFilter`, the same set the export lists
     * @param session - the hard delete's transaction; a write outside it would survive a rollback
     * @returns how many tickets went
     */
    deleteOwned: (filter: OwnTicketsFilter, session: ClientSession): Promise<number> =>
        // Mongoose: Model.deleteMany(filter, { session }) — https://mongoosejs.com/docs/api/model.html#Model.deleteMany()
        ticketModel
            .deleteMany(filter, { session })
            .exec()
            .then(({ deletedCount }) => deletedCount)
};
