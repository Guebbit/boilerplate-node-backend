/**
 * @module
 * Contact requests: anyone may file one, admins read and triage them. A message sent while signed
 * in records the sender's account; an anonymous one only the address typed. The export and the
 * erasure take both (see `./domain/ownership`). A leaf in both directions.
 *
 * See: docs/modules/tickets.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { ticketsRateLimits } from './rate-limits';
import { ticketService } from './service';
import { ticketsConfig } from './config';

/** This module's manifest entry: public contact form, keyed triage (`tickets.*`). */
export default {
    name: 'tickets',
    mounts: [{ basePath: '/tickets', routes: router }],
    config: [ticketsConfig.slice],
    /** The contact-form budgets — see `./rate-limits.ts`. */
    rateLimits: ticketsRateLimits,
    personalData: [
        {
            section: 'tickets',
            // Always an array: the section is required in the contract. The set is the one
            // `erase` removes (`./domain/ownership`).
            collect: (subject) => ticketService.findOwnTicketsForExport(subject),
            // Inside the hard-delete transaction only, never at the reversible lock.
            erase: (subject, session) => ticketService.eraseOwnTickets(subject, session)
        }
    ],
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
