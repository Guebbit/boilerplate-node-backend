/**
 * @module
 * Zammad's copy of a person, read for the account data export (GDPR Art. 15 and 20): the customer,
 * their tickets, every article with internal notes included and the author left out, and the files
 * the customer themselves sent. It reads Zammad through its API on every export; nothing is cached.
 *
 * Why it fails the export when Zammad is down: an export without the help desk's half must never
 * look like a complete one (`account`'s export rule), so a rejection here rejects the whole build.
 *
 * @see docs/modules/zammad.md#export
 */

import type { PersonalDataSubject } from '@kernel/registry';
import {
    downloadAttachment,
    findUsersByEmail,
    getUser,
    listArticles,
    searchAllTickets,
    type ZammadArticle,
    type ZammadTicket
} from '../client';
import { zammadSettings, type ZammadSettings } from '../config';
import { findCustomer } from '../repository';

/** A file the customer sent, carried in the export itself. */
export interface ExportAttachment {
    filename: string;
    contentType?: string;
    size: number;
    contentBase64: string;
}

/** One article, in wire shape. */
export interface ExportArticle {
    id: number;
    type?: string;
    sender?: string;
    internal: boolean;
    subject?: string;
    body: string;
    contentType?: string;
    createdAt?: string;
    /** Only on an article the customer wrote: staff addresses are not this person's data. */
    from?: string;
    to?: string;
    cc?: string;
    attachments?: ExportAttachment[];
}

/** One ticket, in wire shape. */
export interface ExportTicket {
    id: number;
    number?: string;
    title?: string;
    state?: string;
    createdAt?: string;
    articles: ExportArticle[];
}

/** One Zammad customer, in wire shape. */
export interface ExportCustomer {
    id: number;
    email?: string;
    firstname?: string;
    lastname?: string;
    createdAt?: string;
    tickets: ExportTicket[];
}

/**
 * One optional text member of an export object: present when Zammad has the text, absent otherwise,
 * so an export never carries `null` (the house empty/null/absent standard).
 *
 * @param key - the wire name
 * @param value - Zammad's text, if any
 */
const present = (key: string, value: string | null | undefined): Record<string, string> =>
    value ? { [key]: value } : {};

/**
 * The attachments of one article the customer sent, downloaded one at a time.
 *
 * @param settings - where Zammad is
 * @param ticketId - Zammad's id of the ticket
 * @param article - the article, with its attachment list
 */
const attachmentsOf = async (
    settings: ZammadSettings,
    ticketId: number,
    article: ZammadArticle
): Promise<ExportAttachment[]> => {
    const files: ExportAttachment[] = [];
    for (const attachment of article.attachments ?? []) {
        const bytes = await downloadAttachment(settings, ticketId, article.id, attachment.id);
        const mime =
            attachment.preferences?.['Mime-Type'] ?? attachment.preferences?.['Content-Type'];
        files.push({
            filename: attachment.filename ?? String(attachment.id),
            ...(typeof mime === 'string' ? { contentType: mime } : {}),
            size: bytes.byteLength,
            contentBase64: bytes.toString('base64')
        });
    }
    return files;
};

/**
 * One article in wire shape. The author is left out of everything the customer did not write:
 * the `from`, `to` and `cc` of an agent's reply or an internal note name a member of staff.
 *
 * @param settings - where Zammad is
 * @param ticketId - Zammad's id of the ticket
 * @param article - the article as Zammad has it
 */
const exportArticle = async (
    settings: ZammadSettings,
    ticketId: number,
    article: ZammadArticle
): Promise<ExportArticle> => {
    const fromCustomer = article.sender === 'Customer';
    const attachments = fromCustomer ? await attachmentsOf(settings, ticketId, article) : [];
    return {
        id: article.id,
        ...present('type', article.type),
        ...present('sender', article.sender),
        internal: article.internal ?? false,
        ...present('subject', article.subject),
        body: article.body ?? '',
        ...present('contentType', article.content_type),
        ...present('createdAt', article.created_at),
        ...(fromCustomer
            ? {
                  ...present('from', article.from),
                  ...present('to', article.to),
                  ...present('cc', article.cc)
              }
            : {}),
        ...(attachments.length > 0 ? { attachments } : {})
    };
};

/**
 * Every ticket of a customer. Only rows that name this customer are kept: if Zammad ignored the
 * condition, an Art. 15 export would otherwise carry other people's tickets.
 *
 * @param settings - where Zammad is
 * @param customerId - the Zammad customer
 */
const ticketsOf = (settings: ZammadSettings, customerId: number): Promise<ZammadTicket[]> =>
    searchAllTickets(settings, {
        'ticket.customer_id': { operator: 'is', value: customerId }
    }).then((rows) => rows.filter((row) => row.customer_id === customerId));

/**
 * Which Zammad customers are this person: the one their account maps to, and every one holding
 * their verified address (they may have written before they had an account).
 *
 * @param settings - where Zammad is
 * @param subject - who the export is about
 */
const customerIdsOf = (settings: ZammadSettings, subject: PersonalDataSubject): Promise<number[]> =>
    Promise.all([
        findCustomer(subject.userId),
        subject.emailVerified ? findUsersByEmail(settings, subject.email) : Promise.resolve([])
    ]).then(([mapping, byAddress]) => [
        ...new Set([...(mapping ? [mapping.zammadUserId] : []), ...byAddress.map(({ id }) => id)])
    ]);

/**
 * The Zammad half of the export: one entry per customer, with their tickets and articles. Absent
 * (`undefined`) while the module is inert, so the section stays what it was without Zammad.
 *
 * @param subject - who the export is about
 * @throws {ZammadRequestError} when Zammad cannot be read: the export fails whole
 */
export const collectZammadCopy = async (
    subject: PersonalDataSubject
): Promise<ExportCustomer[] | undefined> => {
    const settings = zammadSettings();
    if (!settings) return undefined;

    const customers: ExportCustomer[] = [];
    for (const id of await customerIdsOf(settings, subject)) {
        const user = await getUser(settings, id);
        // A mapping whose customer is gone (deleted by retention, or by hand): nothing left to export.
        if (!user) continue;

        const tickets: ExportTicket[] = [];
        for (const ticket of await ticketsOf(settings, id)) {
            const articles: ExportArticle[] = [];
            for (const article of await listArticles(settings, ticket.id))
                articles.push(await exportArticle(settings, ticket.id, article));
            tickets.push({
                id: ticket.id,
                ...present('number', ticket.number),
                ...present('title', ticket.title),
                ...present('state', ticket.state),
                ...present('createdAt', ticket.created_at),
                articles
            });
        }
        customers.push({
            id: user.id,
            ...present('email', user.email),
            ...present('firstname', user.firstname),
            ...present('lastname', user.lastname),
            ...present('createdAt', user.created_at),
            tickets
        });
    }
    return customers;
};
