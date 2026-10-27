/**
 * @module
 * Ticket service — the contact form's creation (announced on the bus), the staff reads
 * and delete, and the module's two `personalData` halves (export, erasure). The doors that move a
 * ticket (resolve, assign, note…) are in `./workflow`; the rules they apply are in `./domain`.
 *
 * See: docs/modules/tickets.md
 */

import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import { TicketKind, TicketResolution, TicketSource } from '@types';
import type {
    CallerContext,
    CreateContactTicketRequest,
    ExportSystemTicket,
    ExportTicket,
    SearchTicketsRequest,
    Ticket
} from '@types';
import type { PersonalDataSubject } from '@kernel/registry';
import type { TicketDocument } from './model';
import { ticketRepository } from './repository';
import {
    generateReject,
    generateSuccess,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { getDefaultLocale, t } from '@infrastructure/i18n';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { emitDomainEvent } from '@kernel/events';
import { logger } from '@infrastructure/adapters/logger';
import { checkEmailPolicy } from '@infrastructure/adapters/antibot';
import { contactRequestEmail } from './emails';
import {
    readAll,
    MAX_CONFIGURED_PAGE_SIZE,
    type PaginatedMeta
} from '@infrastructure/persistence/search';
import { toObjectId, type Lean } from '@infrastructure/persistence/create-repository';
import { recordAudit } from '@infrastructure/observability/audit';
import { normalizeEmail } from '@infrastructure/persistence/normalize-email';
import { OPEN_STATUSES, initialTicketStatus, ownTicketsFilter, routeSetOf } from './domain';
import { ticketsConfig } from './config';
import { ticketsAuditActions } from './audit';
import { TICKET_OPENED } from './events';
import { inJurisdiction, jurisdictionScope, mayDelete } from './access';
import { presentTicket, withView } from './presenter';
import { assigneeNamesOf, viewerOf } from './views';
import { workflow } from './services/workflow';

/** How long a contact message may wait before it is overdue, in milliseconds. */
const contactSlaMs = (): number => ticketsConfig().NODE_TICKETS_CONTACT_SLA_HOURS * 3_600_000;

/**
 * Record a contact request and announce it as `ticket.opened` — unless the honeypot caught it.
 *
 * Both halves live here because "a customer asked us something" is one event, not a write plus a
 * thing the HTTP layer remembers to do afterwards. Who is told, and how, is `notifications`'
 * business: it hears the event.
 *
 * Honeypot:   `payload.website` is a field a real browser always submits empty and a bot reliably
 *             fills, declared in the contract but never persisted (see `TicketDocument`)
 *             or read back. A non-empty value writes the row as `spam` and announces nothing
 *             — the bot still gets its `201`, so it learns nothing, but nobody's inbox hears
 *             about it.
 * Account:    `subjectId` is the signed-in sender's account, so the export and the erasure follow the
 *             ticket to the person; absent for an anonymous sender.
 * Disposable: a disposable-inbox domain (`checkEmailPolicy`, off by default) is treated the same
 *             way — filed as `spam`, not announced, still a `201`. A visible refusal would
 *             tell a spam script exactly which signal caught it.
 */
const create = (
    payload: CreateContactTicketRequest,
    subjectId?: string
): Promise<TicketDocument> => {
    const email = normalizeEmail(payload.email);
    const now = new Date();
    const honeypotFilled = Boolean(payload.website?.trim());

    return checkEmailPolicy(email).then((verdict) => {
        const suspectedSpam = honeypotFilled || verdict === 'refused';

        return ticketRepository
            .create({
                name: payload.name?.trim() || undefined,
                ...(subjectId ? { subjectId: toObjectId(subjectId) } : {}),
                email,
                subject: payload.subject.trim(),
                message: payload.message.trim(),
                ...(payload.category ? { category: payload.category } : {}),
                ...(payload.orderNumber?.trim() ? { orderNumber: payload.orderNumber.trim() } : {}),
                source: TicketSource.visitor,
                kind: TicketKind.contact,
                routeSet: routeSetOf(TicketKind.contact),
                status: initialTicketStatus(suspectedSpam),
                // Spam is closed at birth: it ages from now and never owes work.
                ...(suspectedSpam
                    ? { closedAt: now, resolution: TicketResolution.spam }
                    : { dueAt: new Date(now.getTime() + contactSlaMs()) })
            })
            .then((created) =>
                suspectedSpam
                    ? created
                    : emitDomainEvent(TICKET_OPENED, {
                          tenantId: DEPLOYMENT_TENANT_ID,
                          ticketId: String(created._id),
                          kind: created.kind,
                          routeSet: created.routeSet,
                          ...(created.category ? { category: created.category } : {})
                      }).then(() => created)
            );
    });
};

/**
 * Mail the contact message to the fallback mailbox, `NODE_CONTACT_NOTIFY_EMAIL`, when nobody who
 * could work it has an address to be told at. The one mail that carries the visitor's own words,
 * because that mailbox is then the whole inbox, and it carries `Reply-To: <the visitor>` so
 * answering it reaches them. A no-op without the mailbox, or for a ticket that is gone or not a
 * contact message.
 *
 * It goes to the operator, not to the sender, so it renders in `NODE_DEFAULT_LOCALE` and takes no
 * `CallerContext`. A failed queue is logged, never raised: the ticket is already stored.
 *
 * @param ticketId - the contact ticket that found nobody to tell
 */
const mailFallbackMailbox = (ticketId: string): Promise<void> => {
    const mailbox = ticketsConfig().NODE_CONTACT_NOTIFY_EMAIL;
    if (!mailbox) return Promise.resolve();

    return ticketRepository.findById(ticketId).then((ticket) => {
        if (!ticket?.email || ticket.kind !== TicketKind.contact) return;

        const mail = contactRequestEmail(getDefaultLocale(), {
            name: ticket.name,
            email: ticket.email,
            subject: ticket.subject,
            message: ticket.message,
            category: ticket.category,
            createdAt: ticket.createdAt?.toISOString()
        });

        return enqueueEmail(
            // `replyTo`: the bare address only (already normalised on create), never a display
            // name: the visitor's free-text name must not reach a header.
            { to: mailbox, subject: mail.subject, replyTo: ticket.email },
            mail.template,
            mail.data
        )
            .then(() => undefined)
            .catch((error: unknown) => {
                // Stryker disable all
                logger.error({ message: 'ticket fallback mailbox email failed', error });
                // Stryker restore all
            });
    });
};

/** What a search may filter on, past the repository's own text and address matching. */
type TicketFilters = Omit<SearchTicketsRequest, 'page' | 'pageSize'> & {
    page?: string | number;
    pageSize?: string | number;
};

/**
 * The part of a search that is a closed enum or a relation, declared as scope rather than on the
 * repository's spec: each has its own collection-wide meaning, not a per-field text match.
 *
 * @param filters - the validated filters
 * @param context - the caller, whose jurisdiction bounds the search and whose id `assignee=me` reads
 * @param now - the clock, for `overdue`
 */
const scopeOf = (
    filters: TicketFilters,
    context: CallerContext,
    now: Date
): Record<string, unknown> => {
    const { caller } = context;
    const clauses: Record<string, unknown>[] = [jurisdictionScope(caller)];

    if (filters.overdue === true)
        clauses.push({ status: { $in: OPEN_STATUSES }, dueAt: { $lt: now } });

    if (filters.assignee === 'none') clauses.push({ assigneeId: { $exists: false } });
    else if (filters.assignee !== undefined) {
        const who = filters.assignee === 'me' ? caller.id : filters.assignee;
        // `me` for a caller with no account (an API key), or an id that is not one, matches nothing.
        clauses.push(
            who !== null && who !== undefined && Types.ObjectId.isValid(who)
                ? { assigneeId: toObjectId(who) }
                : { _id: { $in: [] } }
        );
    }

    return {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.category ? { category: filters.category } : {}),
        ...(filters.source ? { source: filters.source } : {}),
        ...(filters.kind ? { kind: filters.kind } : {}),
        $and: clauses
    };
};

/**
 * Search tickets by status, kind, source, assignee, overdue, email fragment or free text,
 * paginated — inside the caller's jurisdiction.
 *
 * Emits `ticketsAuditActions.ADMIN_TICKET_VIEWED` when a `context` is given.
 *
 * @param filters - the validated filters; `page`/`pageSize` may be strings, which
 *   `normalizePagination` coerces and bounds
 * @param context - the caller. Required: the jurisdiction is theirs.
 */
const search = (
    filters: TicketFilters,
    context: CallerContext
): Promise<{ items: Ticket[]; meta: PaginatedMeta }> => {
    const now = new Date();

    return ticketRepository
        .search(filters, scopeOf(filters, context, now))
        .then(({ items, meta }) =>
            assigneeNamesOf(items.map((row) => row.assigneeId)).then((names) => {
                const viewer = viewerOf(context.caller, names);
                recordAudit(context, {
                    action: ticketsAuditActions.ADMIN_TICKET_VIEWED,
                    outcome: 'success'
                });
                return { items: items.map((row) => withView(row, viewer.of(row), now)), meta };
            })
        );
};

/**
 * One ticket by id, inside the caller's jurisdiction, with its notes, its assignee's name and the
 * earlier tickets about the same record. A ticket outside the jurisdiction is a 404, not a 403: it
 * does not admit to existing.
 *
 * @param id - the ticket
 * @param context - the caller
 * @returns the ticket, or the 404 a missing or out-of-jurisdiction one earns
 */
const getById = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<Ticket> | ResponseReject> =>
    ticketRepository.findById(id).then((ticket) => {
        if (!ticket || !inJurisdiction(context.caller, ticket))
            return generateReject(404, [t('generic.error-item-gone')]);

        return Promise.all([
            assigneeNamesOf([ticket.assigneeId?.toString()]),
            ticket.link ? earlierThan(ticket, context) : Promise.resolve([])
        ]).then(([names, earlierTickets]) =>
            generateSuccess(
                presentTicket(ticket, {
                    ...viewerOf(context.caller, names).of(ticket),
                    earlierTickets
                })
            )
        );
    });

/**
 * The tickets about the same record that came before this one, newest first, inside the caller's
 * jurisdiction.
 *
 * @param ticket - the ticket being read
 * @param context - the caller
 */
const earlierThan = (ticket: TicketDocument, context: CallerContext) =>
    ticketRepository
        .findAll(
            {
                'link.type': ticket.link?.type,
                'link.id': ticket.link?.id,
                _id: { $ne: ticket._id },
                createdAt: { $lte: ticket.createdAt },
                ...jurisdictionScope(context.caller)
            },
            { sort: { createdAt: -1 }, limit: 20 }
        )
        .then((rows) =>
            rows.map((row) => ({
                id: String(row._id),
                kind: row.kind,
                status: row.status,
                createdAt: (row.createdAt ?? new Date(0)).toISOString()
            }))
        );

/**
 * Loads a ticket by id and permanently removes it, then — on success — emits
 * `ticketsAuditActions.ADMIN_TICKET_DELETED`. Needs `delete:Ticket` and, for a system ticket,
 * its route set.
 *
 * No soft-delete tier: this module has none, so unlike `orders`' `removeById` there is no
 * `hardDelete` flag to thread through.
 *
 * @returns A 404 when the id names no ticket in the caller's jurisdiction, a 403 when the caller
 *   may see but not delete it, otherwise the removal result.
 */
const removeById = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    ticketRepository.findById(id).then((ticket) => {
        if (!ticket || !inJurisdiction(context.caller, ticket))
            return generateReject(404, [t('generic.error-item-gone')]);
        if (!mayDelete(context.caller, ticket))
            return generateReject(403, [t('generic.error-forbidden')]);

        return ticketRepository.deleteOne(ticket).then(() => {
            recordAudit(context, {
                action: ticketsAuditActions.ADMIN_TICKET_DELETED,
                outcome: 'success',
                targetType: 'ticket',
                targetId: id
            });
            return generateSuccess(undefined);
        });
    });

/**
 * A person's own visitor tickets — what they sent signed in, plus what was sent under their
 * verified address (`ownTicketsFilter`). Deliberately `findAll` with a raw filter, not `search`'s
 * `email` spec: that spec is a REGEX for staff free-text search, and a substring match here would
 * hand one person another's ticket whose address happens to contain theirs.
 *
 * @param subject - who the export is about
 */
const findOwnTickets = (subject: PersonalDataSubject): Promise<Lean<TicketDocument>[]> =>
    readAll(
        (page) =>
            ticketRepository.findAll(ownTicketsFilter(subject), {
                skip: (page - 1) * MAX_CONFIGURED_PAGE_SIZE,
                limit: MAX_CONFIGURED_PAGE_SIZE
            }),
        MAX_CONFIGURED_PAGE_SIZE
    );

/**
 * The staff notes as the data subject sees them: the words and the time, never the author (the
 * author is a colleague's data, and who wrote it is not the subject's to know).
 *
 * @param ticket - the stored ticket
 */
const exportNotesOf = (ticket: Lean<TicketDocument>) =>
    ticket.notes.map((note) => ({ body: note.body, at: note.at.toISOString() }));

/**
 * {@link ExportTicket}, built from the real document. A REAL plain object, not a type-level `Omit`
 * on the Mongoose document: the document's own `toJSON()` carries no such omission, so returning
 * the document itself would still serialize every staff field.
 */
const toExportTicket = (ticket: Lean<TicketDocument>): ExportTicket => ({
    id: String(ticket._id),
    ...(ticket.name === undefined ? {} : { name: ticket.name }),
    email: ticket.email ?? '',
    subject: ticket.subject,
    message: ticket.message,
    ...(ticket.category ? { category: ticket.category } : {}),
    ...(ticket.orderNumber ? { orderNumber: ticket.orderNumber } : {}),
    status: ticket.status,
    notes: exportNotesOf(ticket),
    ...(ticket.respondedAt ? { respondedAt: ticket.respondedAt.toISOString() } : {}),
    ...(ticket.createdAt ? { createdAt: ticket.createdAt.toISOString() } : {})
});

/**
 * {@link findOwnTickets}, shaped for the account data export: exactly the set
 * {@link eraseOwnTickets} removes.
 *
 * @param subject - who the export is about
 */
const findOwnTicketsForExport = (subject: PersonalDataSubject): Promise<ExportTicket[]> =>
    findOwnTickets(subject).then((tickets) => tickets.map((ticket) => toExportTicket(ticket)));

/**
 * {@link ExportSystemTicket}: every field the system holds about the situation except the staff
 * behind it (`assigneeId`, the notes' authors) and the dedup key. A ticket is itself an assessment
 * of the person, so it is the person's to read (CJEU C-434/16, EDPB 01/2022).
 */
const toExportSystemTicket = (ticket: Lean<TicketDocument>): ExportSystemTicket => ({
    id: String(ticket._id),
    kind: ticket.kind,
    subject: ticket.subject,
    message: ticket.message,
    ...(ticket.link ? { link: { type: ticket.link.type, id: ticket.link.id } } : {}),
    routeSet: ticket.routeSet,
    status: ticket.status,
    ...(ticket.resolution ? { resolution: ticket.resolution } : {}),
    notes: exportNotesOf(ticket),
    ...(ticket.dueAt ? { dueAt: ticket.dueAt.toISOString() } : {}),
    ...(ticket.lastSeenAt ? { lastSeenAt: ticket.lastSeenAt.toISOString() } : {}),
    ...(ticket.seenCount ? { seenCount: ticket.seenCount } : {}),
    ...(ticket.respondedAt ? { respondedAt: ticket.respondedAt.toISOString() } : {}),
    ...(ticket.closedAt ? { closedAt: ticket.closedAt.toISOString() } : {}),
    ...(ticket.createdAt ? { createdAt: ticket.createdAt.toISOString() } : {})
});

/**
 * The tickets the system opened about this person, shaped for the export. Matched by `subjectId`
 * alone: a system ticket is about an account, never about an address.
 *
 * @param subject - who the export is about
 */
const findSystemTicketsForExport = (subject: PersonalDataSubject): Promise<ExportSystemTicket[]> =>
    readAll(
        (page) =>
            ticketRepository.findAll(
                { source: TicketSource.system, subjectId: toObjectId(subject.userId) },
                {
                    skip: (page - 1) * MAX_CONFIGURED_PAGE_SIZE,
                    limit: MAX_CONFIGURED_PAGE_SIZE
                }
            ),
        MAX_CONFIGURED_PAGE_SIZE
    ).then((tickets) => tickets.map((ticket) => toExportSystemTicket(ticket)));

/**
 * Erase what the person owns — the `personalData.erase` hook, run only inside a hard delete's
 * transaction (never at the reversible lock, so a restore finds every message):
 *   - their visitor tickets, open and spam included;
 *   - system tickets that ARE the person's (the record is the account or its export), deleted;
 *   - system tickets about an order, payment… that outlive them, detached from the account;
 *   - their name as assignee and as the author of notes, wherever they worked.
 *
 * @param subject - the erased account
 * @param session - the erasure's transaction
 */
const eraseOwnTickets = async (
    subject: PersonalDataSubject,
    session: ClientSession
): Promise<void> => {
    // Sequential: a `ClientSession` runs ONE operation at a time.
    await ticketRepository.deleteOwned(ownTicketsFilter(subject), session);
    await ticketRepository.deleteSystemAbout(subject.userId, session);
    await ticketRepository.detachSubject(subject.userId, session);
    await ticketRepository.forgetStaff(subject.userId, session);
};

/** The module's barrel export — used by the controllers in `./controllers`. */
export const ticketService = {
    create,
    mailFallbackMailbox,
    search,
    getById,
    removeById,
    ...workflow,
    findOwnTickets,
    findOwnTicketsForExport,
    findSystemTicketsForExport,
    eraseOwnTickets
};
