/**
 * @module
 * The one place a ticket becomes the wire shape `openapi.yaml` declares: the stored fields, plus
 * what is computed per reader or per read (`overdue`, `actions`, the assignee's name, the earlier
 * tickets). Shared by the contact form's 201, the staff reads and every door.
 */

import type { Ticket, TicketRef } from '@types';
import { isOpen, type TicketActionFlags } from './domain';
import type { TicketDocument } from './model';

/** A ticket as stored and read back: the contract's `Ticket` before what is computed per reader. */
export type StoredTicket = Omit<Ticket, 'actions' | 'overdue' | 'assigneeName' | 'earlierTickets'>;

/** What a reader adds to a stored ticket. */
export interface TicketView {
    actions: TicketActionFlags;
    assigneeName?: string;
    earlierTickets?: TicketRef[];
}

/** The view of a reader who may do nothing — the visitor's own 201. */
export const NO_ACTIONS: TicketView = {
    actions: {
        resolve: false,
        markSpam: false,
        reopen: false,
        assign: false,
        unassign: false,
        note: false,
        delete: false
    }
};

/**
 * `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform and drops the dedup
 * key; the document is typed as stored, not as the wire shape, so one cast narrows it.
 *
 * @param document - the stored ticket
 */
export const storedTicketOf = (document: TicketDocument): StoredTicket =>
    document.toJSON() as StoredTicket;

/**
 * A stored ticket with the reader's view added. `overdue` is read-time arithmetic: open and past
 * `dueAt`, so no sweep has to keep it true.
 *
 * @param stored - the ticket on the wire, before the view
 * @param view - what this reader may do, and the names looked up for them
 * @param now - the clock
 */
export const withView = (stored: StoredTicket, view: TicketView, now = new Date()): Ticket => ({
    ...stored,
    overdue:
        isOpen(stored.status) &&
        stored.dueAt !== undefined &&
        Date.parse(stored.dueAt) < now.getTime(),
    actions: view.actions,
    ...(view.assigneeName === undefined ? {} : { assigneeName: view.assigneeName }),
    ...(view.earlierTickets === undefined ? {} : { earlierTickets: view.earlierTickets })
});

/**
 * {@link storedTicketOf} then {@link withView}.
 *
 * @param document - the stored ticket
 * @param view - the reader's view
 */
export const presentTicket = (document: TicketDocument, view: TicketView): Ticket =>
    withView(storedTicketOf(document), view);
