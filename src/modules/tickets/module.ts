/**
 * @module
 * Contact requests: anyone may file one, admins read and triage them. Records an email address
 * rather than referencing a user, since the form is open to people with no account — which is
 * also why deleting an account leaves their tickets standing. A leaf in both directions.
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
            // Matched by email, not id: this form is open to people with no account — so only for
            // an account that has PROVED the address, since anyone can sign up with someone
            // else's. `undefined` (not an empty array) when the flag is off or the address is
            // unproven, so `account`'s assembly omits the key entirely — `tickets` is optional
            // in the contract precisely because most exports carry none.
            collect: (subject) =>
                ticketsConfig().NODE_EXPORT_INCLUDE_TICKETS && subject.emailVerified
                    ? ticketService.findOwnTicketsForExport(subject.email)
                    : Promise.resolve(undefined)
        }
    ],
    locales: path.join(__dirname, 'locales'),
    templates: path.join(__dirname, 'templates')
} satisfies AppModule;
