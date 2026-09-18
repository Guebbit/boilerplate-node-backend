/**
 * @module
 * Contact requests: anyone may file one, admins read and triage them. Records an email address
 * rather than referencing a user, since the form is open to people with no account — which is
 * also why deleting an account leaves their feedback standing. A leaf in both directions.
 *
 * See: docs/modules/feedback.md
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { environmentFlag } from '@infrastructure/runtime/environment';
import { router } from './routes';
import { feedbackRateLimits } from './rate-limits';
import { findOwnTickets } from './service';

/**
 * One of the caller's own feedback tickets, minus `adminNotes`: that field is staff's internal
 * assessment of the ticket, not the submitter's data, and Art. 15(4) protects the rights of
 * others (whoever wrote the note) the same way it protects the submitter's own. A REAL plain
 * object, not a type-level `Omit` on the Mongoose document: the document's own `toJSON()` carries
 * no such omission, so returning the document itself would still serialize `adminNotes`
 * regardless of what a narrower TypeScript type here claimed.
 */
interface ExportFeedbackTicket {
    id: string;
    name?: string;
    email: string;
    subject: string;
    message: string;
    status: string;
    respondedAt?: string;
    createdAt?: string;
}

/** {@link ExportFeedbackTicket}, built from the real document — the one place `adminNotes` is dropped. */
const toExportFeedback = (
    ticket: Awaited<ReturnType<typeof findOwnTickets>>[number]
): ExportFeedbackTicket => ({
    id: String(ticket._id),
    ...(ticket.name === undefined ? {} : { name: ticket.name }),
    email: ticket.email,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    ...(ticket.respondedAt ? { respondedAt: ticket.respondedAt.toISOString() } : {}),
    ...(ticket.createdAt ? { createdAt: ticket.createdAt.toISOString() } : {})
});

/** This module's manifest entry: public contact form, keyed triage (`feedback.*`). */
export default {
    name: 'feedback',
    basePath: '/feedback',
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    permissions: ['feedback.any.read', 'feedback.any.update', 'feedback.any.delete'],
    routes: router,
    /** The contact-form budgets — see `./rate-limits.ts`. */
    rateLimits: feedbackRateLimits,
    personalData: [
        {
            section: 'feedback',
            // Matched by email, not id: this form is open to people with no account. `undefined`
            // (not an empty array) when the flag is off, so `account`'s assembly omits the key
            // entirely — `feedback` is optional in the contract precisely because most exports
            // carry none.
            collect: (subject) =>
                environmentFlag('NODE_EXPORT_INCLUDE_FEEDBACK', false)
                    ? findOwnTickets(subject.email).then((tickets) =>
                          tickets.map((ticket) => toExportFeedback(ticket))
                      )
                    : Promise.resolve(undefined)
        }
    ],
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
