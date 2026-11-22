/**
 * @module
 * Zammad's retention: the daily pass that has Zammad delete what has outlived its window, through
 * the same Data Privacy task the erase job uses. Three rules, all measured by us because Zammad has
 * no retention of its own:
 *
 * Tickets:    last customer message (`last_contact_customer_at`, else creation) older than `NODE_ZAMMAD_RETENTION_DAYS`,
 *             open or closed. Matches basic mode's per-piece rule (`tasks`' retention).
 * Customers:  created before the cutoff, with the Customer role only, and no ticket left.
 * Spam:       a ticket tagged `suspected-spam` after 30 days, whatever its age otherwise.
 *
 * Every search is only a net: each ticket is re-checked in code before a task is filed.
 *
 * Fire and forget: a task is filed, not followed. A task Zammad has not run by tomorrow answers
 * 422 ("already queued") and is skipped, so the pass is safe to repeat.
 *
 * @see docs/modules/zammad.md#retention
 */

import { DAY_MS } from '@domain-primitives/time';
import { logger } from '@infrastructure/adapters/logger';
import {
    fileDataPrivacyTask,
    isPlainCustomer,
    listUsers,
    getTicketTags,
    ZammadRequestError,
    searchAllTickets,
    searchTickets,
    SPAM_TAG,
    USERS_PAGE_SIZE,
    type ZammadTicket
} from '../client';
import { zammadConfig, zammadSettings, type ZammadSettings } from '../config';
import { deleteCustomerByZammadId, groupsVerified } from '../repository';

/** How long a suspected-spam ticket is kept, in days: the same figure as the local spam to-dos. */
const SPAM_RETENTION_DAYS = 30;

/** What one pass did. */
export interface RetentionReport {
    tickets: number;
    customers: number;
    spam: number;
}

/**
 * File a deletion task unless one is already queued.
 *
 * @param settings - where Zammad is
 * @param type - what to delete
 * @param id - its Zammad id
 * @returns whether this call filed a new task
 */
const fileOnce = (
    settings: ZammadSettings,
    type: 'User' | 'Ticket',
    id: number
): Promise<boolean> => fileDataPrivacyTask(settings, type, id).then((filed) => filed !== 'queued');

/**
 * File a task for every ticket a search lists that `due` confirms is past its time. The search is
 * only a net: Zammad may ignore a condition, so `due` re-checks the ticket in code and nothing is
 * deleted on the search's word alone.
 *
 * @param settings - where Zammad is
 * @param condition - the search condition
 * @param due - whether a listed ticket is really to be deleted
 * @returns how many tasks were filed
 */
const reapTickets = async (
    settings: ZammadSettings,
    condition: Record<string, unknown>,
    due: (ticket: ZammadTicket) => boolean | Promise<boolean>
): Promise<number> => {
    let filed = 0;
    for (const ticket of await searchAllTickets(settings, condition)) {
        if ((await due(ticket)) && (await fileOnce(settings, 'Ticket', ticket.id))) filed += 1;
    }
    return filed;
};

/**
 * File a task for every customer created before the cutoff who has the Customer role only and no
 * ticket, and drop the account mapping that pointed at each. An agent, an admin or the integration
 * user carries another role and is never listed.
 * Every page is read: the pass runs daily under a long lease, and a cap would leave whatever lies
 * past it unreaped for ever.
 *
 * @param settings - where Zammad is
 * @param cutoff - customers created before this are candidates
 * @returns how many tasks were filed
 */
const reapCustomers = async (settings: ZammadSettings, cutoff: Date): Promise<number> => {
    let filed = 0;
    const seen = new Set<number>();
    for (let page = 1; ; page += 1) {
        const users = await listUsers(settings, page);
        const fresh = users.filter((user) => !seen.has(user.id));
        for (const user of fresh) seen.add(user.id);

        const candidates = fresh.filter(
            (user) =>
                isPlainCustomer(user) &&
                user.created_at !== undefined &&
                user.created_at !== null &&
                new Date(user.created_at) < cutoff
        );
        for (const user of candidates) {
            const tickets = await searchTickets(
                settings,
                { 'ticket.customer_id': { operator: 'is', value: user.id } },
                1
            );
            if (tickets.length > 0) continue;
            if (await fileOnce(settings, 'User', user.id)) filed += 1;
            // The customer is going: an account still mapped to it would send every later contact
            // to a dead id, so the mapping goes with it (also when the task was already queued).
            await deleteCustomerByZammadId(user.id);
        }
        if (users.length < USERS_PAGE_SIZE) return filed;
        // A full page with nothing new: Zammad ignored `page`, the run cannot be completed.
        if (fresh.length === 0)
            throw new ZammadRequestError('Zammad does not page its user list', false);
    }
};

/**
 * The scheduled pass. Inert while the URL is unset.
 *
 * Customers are reaped only once `zammad:setup` has confirmed the integration role reads every group:
 * a customer whose tickets sit in a group it cannot read looks ticketless and would be deleted with
 * them. Without that marker the tickets and spam still go, the customers are skipped, and the run
 * fails so the alert hears of it.
 *
 * @returns what it filed, by rule
 * @throws {ZammadRequestError} when Zammad cannot be read: the job fails and `ScheduledJobStale` hears of it
 * @throws {Error} when `zammad:setup` never confirmed the role reads every group
 */
export const reapRetention = async (): Promise<RetentionReport> => {
    const settings = zammadSettings();
    if (!settings) return { tickets: 0, customers: 0, spam: 0 };

    const now = Date.now();
    const cutoff = new Date(now - zammadConfig().NODE_ZAMMAD_RETENTION_DAYS * DAY_MS);
    const spamCutoff = new Date(now - SPAM_RETENTION_DAYS * DAY_MS);

    // `created_at` is never later than the last customer contact, so a ticket older than the cutoff by
    // creation is a superset of the ones older by contact; the exact test follows in code.
    const tickets = await reapTickets(
        settings,
        { 'ticket.created_at': { operator: 'before (absolute)', value: cutoff.toISOString() } },
        (ticket) => new Date(ticket.last_contact_customer_at ?? ticket.created_at ?? now) < cutoff
    );
    const spam = await reapTickets(
        settings,
        {
            'ticket.tags': { operator: 'contains one', value: SPAM_TAG },
            'ticket.created_at': {
                operator: 'before (absolute)',
                value: spamCutoff.toISOString()
            }
        },
        // The tag is read back and the age re-checked: a deletion on this rule must not rest on a
        // search condition Zammad may have ignored.
        (ticket) =>
            ticket.created_at !== undefined &&
            ticket.created_at !== null &&
            new Date(ticket.created_at) < spamCutoff &&
            getTicketTags(settings, ticket.id).then((tags) => tags.includes(SPAM_TAG))
    );
    const verified = await groupsVerified();
    const customers = verified ? await reapCustomers(settings, cutoff) : 0;

    logger.info({ message: 'Zammad retention pass done.', tickets, customers, spam });
    if (!verified)
        throw new Error(
            'Zammad retention skipped customers: run `npm run zammad:setup`, which confirms the integration role reads every group.'
        );
    return { tickets, customers, spam };
};
