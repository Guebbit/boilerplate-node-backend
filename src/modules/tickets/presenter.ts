/**
 * @module
 * The one place a ticket document becomes the wire shape `openapi.yaml` declares —
 * so `post-ticket.ts` and `update-ticket-status.ts` share one transform instead of
 * each casting `.toJSON() as Ticket`.
 */

import type { Ticket } from '@types';
import type { TicketDocument } from './model';

/**
 * `.toJSON()` applies the model's `_id` → `id` / date-to-ISO-string transform; Mongoose types its
 * result `any`, and this cast is what makes it a `Ticket`.
 */
export const presentTicket = (document: TicketDocument): Ticket => document.toJSON() as Ticket;
