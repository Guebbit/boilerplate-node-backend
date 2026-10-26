/**
 * @module
 * Ticket service — creation (with the operator notification), search, and status
 * triage. The status rules themselves — narrowing, the starting status, when `respondedAt`
 * stamps — live in `./domain`; this file is the write path around them.
 *
 * See: docs/modules/tickets.md
 */

import type {
    Ticket,
    SearchTicketsRequest,
    UpdateTicketStatusRequest,
    CreateContactTicketRequest,
    ExportTicket
} from '@types';
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
import { logger } from '@infrastructure/adapters/logger';
import { checkEmailPolicy } from '@infrastructure/adapters/antibot';
import { contactRequestEmail } from './emails';
import {
    readAll,
    MAX_CONFIGURED_PAGE_SIZE,
    type PaginatedMeta
} from '@infrastructure/persistence/search';
import type { Lean } from '@infrastructure/persistence/create-repository';
import type { CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import { auditChanges } from '@infrastructure/observability/audit-changes';
import { ticketsAuditActions } from './audit';
import { clearedOrValue } from '@infrastructure/persistence/changes';
import { normalizeEmail } from '@infrastructure/persistence/normalize-email';
import { initialTicketStatus, shouldStampRespondedAt } from './domain';
import { ticketsConfig } from './config';
import { mailConfig } from '@infrastructure/adapters/config';

/**
 * Where the operator's notification goes: the dedicated contact mailbox, then the generic SMTP
 * sender, then nowhere.
 *
 * Read per call rather than captured at import, so a test can vary it — the pattern
 * `inventory/config.ts` sets for this repo. A deployment changes it with a restart.
 */
const notifyMailbox = (): string =>
    ticketsConfig().NODE_CONTACT_NOTIFY_EMAIL ?? mailConfig().NODE_SMTP_SENDER ?? '';

/**
 * Record a contact request and tell the support mailbox about it — unless the honeypot caught it.
 *
 * Both halves live here because "a customer asked us something" is one event, not a write plus a
 * thing the HTTP layer remembers to do afterwards.
 *
 * Why here:   in a controller instead, a second caller of `create` would file a ticket nobody was
 *             told about — and this module would publish its queue job from a controller while
 *             its sibling `delivery` publishes from the service.
 * Honeypot:   `payload.website` is a field a real browser always submits empty and a bot reliably
 *             fills, declared in the contract but never persisted (see `TicketDocument`)
 *             or read back. A non-empty value writes the row as `spam` and skips the notification
 *             — the bot still gets its `201`, so it learns nothing, but nobody's inbox hears
 *             about it.
 * Disposable: a disposable-inbox domain (`checkEmailPolicy`, off by default) is treated the same
 *             way — filed as `spam`, notification skipped, still a `201`. A visible refusal would
 *             tell a spam script exactly which signal caught it.
 */
const create = (payload: CreateContactTicketRequest): Promise<TicketDocument> => {
    const email = normalizeEmail(payload.email);
    const honeypotFilled = Boolean(payload.website?.trim());

    return checkEmailPolicy(email).then((verdict) => {
        const suspectedSpam = honeypotFilled || verdict === 'refused';

        return ticketRepository
            .create({
                name: payload.name?.trim() || undefined,
                email,
                subject: payload.subject.trim(),
                message: payload.message.trim(),
                ...(payload.category ? { category: payload.category } : {}),
                ...(payload.orderNumber?.trim() ? { orderNumber: payload.orderNumber.trim() } : {}),
                status: initialTicketStatus(suspectedSpam)
            })
            .then((created) => {
                if (suspectedSpam) return created;

                const notifyEmail = notifyMailbox();
                if (!notifyEmail) return created;

                /*
                 * The one email that must NOT follow the request's language.
                 *
                 * It goes to the support mailbox, not to the person who filled in the form, so it
                 * is built in `NODE_DEFAULT_LOCALE` — the operator's language, passed explicitly
                 * rather than inherited from whoever happened to submit the form. This is why it
                 * takes no `CallerContext`: there is deliberately nothing about the caller in it.
                 * The customer's own words (`subject`, `message`) pass through untouched, as they
                 * must.
                 */
                const operatorMail = contactRequestEmail(getDefaultLocale(), {
                    name: created.name,
                    email: created.email,
                    subject: created.subject,
                    message: created.message,
                    createdAt: created.createdAt?.toISOString()
                });

                void enqueueEmail(
                    { to: notifyEmail, subject: operatorMail.subject },
                    operatorMail.template,
                    operatorMail.data
                ).catch(
                    (error: unknown) =>
                        // Stryker disable all
                        logger.error({
                            message: 'ticket contact notification email failed',
                            error
                        })
                    // Stryker restore all
                );

                return created;
            });
    });
};

/**
 * Search tickets by status, email fragment or free text, paginated.
 *
 * Emits `ticketsAuditActions.ADMIN_TICKET_VIEWED` when a `context` is given — an omitted
 * context means "not an HTTP request" (a test, or future internal reuse as a plain query helper),
 * so no event is emitted for those.
 */
const search = (
    // `page`/`pageSize` are widened to accept strings: they arrive from a query string, and
    // `normalizePagination` is what coerces and bounds them. `status` is already the closed enum
    // by the time it reaches here — the generated Zod schema validates it at the controller.
    filters: Omit<SearchTicketsRequest, 'page' | 'pageSize'> & {
        page?: string | number;
        pageSize?: string | number;
    } = {},
    // Omitted by callers that are not a request answering `GET /tickets` (tests, and any future
    // internal reuse of this as a plain query helper) — no context means no emit.
    context?: CallerContext
): Promise<{
    items: Ticket[];
    meta: PaginatedMeta;
}> =>
    // `status` and `category` are declared as a scope rather than on the repository's own search
    // spec: each is a closed enum with its own collection-wide meaning, not a per-field text/exact
    // match.
    ticketRepository
        .search(filters, {
            ...(filters.status ? { status: filters.status } : {}),
            ...(filters.category ? { category: filters.category } : {})
        })
        .then((result) => {
            recordAudit(context, {
                action: ticketsAuditActions.ADMIN_TICKET_VIEWED,
                outcome: 'success'
            });
            return result;
        });

/**
 * Applies a status/notes patch to an already-loaded ticket and persists it.
 *
 * `respondedAt` is stamped once, the first time a ticket reaches `resolved` — re-resolving an
 * already-resolved ticket must not move the timestamp.
 *
 * Always succeeds once called — there is no validation branch here, only a write. A failed
 * `save` rejects the promise rather than resolving a `ResponseReject`, which is why the return
 * type carries no reject case; `updateStatusById` is what can still answer 404, before this runs.
 */
const updateStatus = (
    ticket: TicketDocument,
    payload: UpdateTicketStatusRequest
): Promise<ResponseSuccess<TicketDocument>> => {
    const nextStatus = payload.status;
    if (nextStatus !== undefined) ticket.status = nextStatus;
    // `null` clears the notes — $unset on save, via `clearedOrValue`.
    if (payload.adminNotes !== undefined) ticket.adminNotes = clearedOrValue(payload.adminNotes);
    if (shouldStampRespondedAt(nextStatus, Boolean(ticket.respondedAt)))
        ticket.respondedAt = new Date();
    return ticketRepository.save(ticket).then((saved) => generateSuccess(saved));
};

/**
 * Loads a ticket by id, applies {@link updateStatus}, and — on success — emits
 * `ticketsAuditActions.ADMIN_TICKET_STATUS_UPDATED`.
 *
 * @returns A 404 `ResponseReject` when the id names no ticket, otherwise the save result.
 */
const updateStatusById = (
    id: string,
    payload: UpdateTicketStatusRequest,
    context?: CallerContext
): Promise<ResponseSuccess<TicketDocument> | ResponseReject> =>
    ticketRepository.findById(id).then((ticket) => {
        if (!ticket) return generateReject(404, [t('generic.error-not-found')]);
        // Read before `updateStatus` assigns onto the document. The notes are free text: by name only.
        const metadata = auditChanges(ticket, payload, {
            valued: ['status'],
            named: ['adminNotes']
        });

        return updateStatus(ticket, payload).then((result) => {
            recordAudit(context, {
                action: ticketsAuditActions.ADMIN_TICKET_STATUS_UPDATED,
                outcome: 'success',
                targetType: 'tickets',
                targetId: id,
                metadata
            });
            return result;
        });
    });

/**
 * One ticket by id — the item read of the list the admin queue shows. The same rows the list
 * returns, so there is no further scope: whoever holds `read:Ticket` reads any of them.
 *
 * @param id - the ticket
 * @returns the ticket, or the 404 a missing one earns
 */
const getById = (id: string): Promise<ResponseSuccess<TicketDocument> | ResponseReject> =>
    ticketRepository
        .findById(id)
        .then((ticket) =>
            ticket ? generateSuccess(ticket) : generateReject(404, [t('generic.error-not-found')])
        );

/**
 * Loads a ticket by id and permanently removes it, then — on success — emits
 * `ticketsAuditActions.ADMIN_TICKET_DELETED`.
 *
 * No soft-delete tier: this module has none, so unlike `orders`' `removeById` there is no
 * `hardDelete` flag to thread through.
 *
 * @returns A 404 `ResponseReject` when the id names no ticket, otherwise the removal result.
 */
const removeById = (
    id: string,
    context?: CallerContext
): Promise<ResponseSuccess<undefined> | ResponseReject> =>
    ticketRepository.findById(id).then((ticket) => {
        if (!ticket) return generateReject(404, [t('generic.error-not-found')]);
        return ticketRepository.deleteOne(ticket).then(() => {
            recordAudit(context, {
                action: ticketsAuditActions.ADMIN_TICKET_DELETED,
                outcome: 'success',
                targetType: 'tickets',
                targetId: id
            });
            return generateSuccess(undefined);
        });
    });

/**
 * A caller's own tickets, matched EXACTLY on `email` — for the account's own data export, behind
 * `NODE_EXPORT_INCLUDE_TICKETS` (the caller decides whether to include this; this function just
 * answers the question correctly once asked). Deliberately `findAll` with a raw filter, not
 * `search`'s `email` spec: that spec is a REGEX for staff free-text search, and a substring match
 * here would hand one person another's ticket whose address happens to contain theirs as a
 * substring. An account and a ticket sharing an address are still only a guess at being the same
 * person — the caller of this function is what decides whether that guess is worth taking.
 */
const findOwnTickets = (email: string): Promise<Lean<TicketDocument>[]> =>
    readAll(
        (page) =>
            ticketRepository.findAll(
                { email },
                { skip: (page - 1) * MAX_CONFIGURED_PAGE_SIZE, limit: MAX_CONFIGURED_PAGE_SIZE }
            ),
        MAX_CONFIGURED_PAGE_SIZE
    );

/**
 * {@link ExportTicket}, built from the real document — the one place `adminNotes` is
 * dropped: that field is staff's internal assessment of the ticket, not the submitter's data, and
 * Art. 15(4) protects the rights of others (whoever wrote the note) the same way it protects the
 * submitter's own. A REAL plain object, not a type-level `Omit` on the Mongoose document: the
 * document's own `toJSON()` carries no such omission, so returning the document itself would
 * still serialize `adminNotes` regardless of what a narrower TypeScript type here claimed.
 */
const toExportTicket = (ticket: Lean<TicketDocument>): ExportTicket => ({
    id: String(ticket._id),
    ...(ticket.name === undefined ? {} : { name: ticket.name }),
    email: ticket.email,
    subject: ticket.subject,
    message: ticket.message,
    ...(ticket.category ? { category: ticket.category } : {}),
    ...(ticket.orderNumber ? { orderNumber: ticket.orderNumber } : {}),
    status: ticket.status,
    ...(ticket.respondedAt ? { respondedAt: ticket.respondedAt.toISOString() } : {}),
    ...(ticket.createdAt ? { createdAt: ticket.createdAt.toISOString() } : {})
});

/**
 * {@link findOwnTickets}, shaped for the account data export. The `NODE_EXPORT_INCLUDE_TICKETS`
 * gate lives in `module.ts`: whether to call this at all is a wiring decision, not this one's.
 *
 * @param email - the caller's own email, matched exactly
 */
const findOwnTicketsForExport = (email: string): Promise<ExportTicket[]> =>
    findOwnTickets(email).then((tickets) => tickets.map((ticket) => toExportTicket(ticket)));

/** The module's barrel export — used by the controllers in `./controllers`. */
export const ticketService = {
    create,
    search,
    getById,
    updateStatusById,
    removeById,
    findOwnTickets,
    findOwnTicketsForExport
};
