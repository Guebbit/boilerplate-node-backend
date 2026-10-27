/**
 * @module
 * The doors that move a ticket: resolve, mark as spam, reopen, assign, unassign, add a note, and
 * the staff badge's counts. Every move is ONE conditional write filtered on the status the caller
 * read, so two clicks produce one 200 and one 409. The rules (which status may go where, which
 * stamps a move owes) are `./domain`; this file is the write path around them.
 *
 * See: docs/modules/tickets.md
 */

import { Types } from 'mongoose';
import type { CallerContext, Ticket, TicketSummary } from '@types';
import { ERROR_CODES, type ErrorCode } from '@api/error-codes';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';
import { recordAudit } from '@infrastructure/observability/audit';
import { toObjectId } from '@infrastructure/persistence/create-repository';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { emitDomainEvent } from '@kernel/events';
import { accessService } from '@modules/access';
import { userService } from '@modules/users';
import { ticketsAuditActions } from '../audit';
import { inJurisdiction, jurisdictionScope, mayWork, roleHoldsRouteSet } from '../access';
import {
    isOpen,
    markSpam,
    OPEN_STATUSES,
    reopen,
    resolve,
    type TicketFacts,
    type TicketRefusal,
    type Transition
} from '../domain';
import { TICKET_ASSIGNED } from '../events';
import type { TicketDocument } from '../model';
import { presentTicket } from '../presenter';
import { ticketRepository } from '../repository';
import { assigneeNamesOf, viewerOf } from '../views';

/** The doors that change a ticket's status by the domain's rules. */
type Door = 'resolve' | 'markSpam' | 'reopen';

/** Each door's rule and the audit action it records. */
const DOORS: Record<
    Door,
    { rule: (facts: TicketFacts, now: Date) => Transition; audit: keyof typeof ticketsAuditActions }
> = {
    resolve: { rule: (facts, now) => resolve(facts, now), audit: 'ADMIN_TICKET_RESOLVED' },
    markSpam: { rule: (facts, now) => markSpam(facts, now), audit: 'ADMIN_TICKET_MARKED_SPAM' },
    reopen: { rule: (facts) => reopen(facts), audit: 'ADMIN_TICKET_REOPENED' }
};

/** The 409 code and message key of each refusal. */
const REFUSALS: Record<TicketRefusal, { code: ErrorCode; key: string }> = {
    already_resolved: {
        code: ERROR_CODES.TICKET_ALREADY_RESOLVED,
        key: 'tickets.already-resolved'
    },
    already_spam: { code: ERROR_CODES.TICKET_ALREADY_SPAM, key: 'tickets.already-spam' },
    already_open: { code: ERROR_CODES.TICKET_ALREADY_OPEN, key: 'tickets.already-open' }
};

/** Whether an error is Mongo's duplicate-key refusal (E11000). */
const isDuplicateKey = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'code' in error && error.code === 11_000;

/** The 409 for assigning a ticket that is closed. */
const notOpen = (): ResponseReject =>
    generateReject(409, [{ code: ERROR_CODES.TICKET_NOT_OPEN, message: t('tickets.not-open') }]);

/** The 404 a missing or out-of-jurisdiction ticket earns: it does not admit to existing. */
const notFound = (): ResponseReject => generateReject(404, [t('generic.error-item-gone')]);

/**
 * A ticket's facts, as the lifecycle rules read them.
 *
 * @param ticket - the stored ticket
 */
const factsOf = (ticket: TicketDocument): TicketFacts => ({
    status: ticket.status,
    closedAt: ticket.closedAt,
    respondedAt: ticket.respondedAt,
    assigned: ticket.assigneeId !== undefined,
    kind: ticket.kind,
    link: ticket.link ? { type: ticket.link.type, id: ticket.link.id } : undefined
});

/**
 * The ticket as the caller reads it now: assignee name and the caller's actions added.
 *
 * @param ticket - the stored ticket
 * @param context - the caller
 */
const present = (ticket: TicketDocument, context: CallerContext): Promise<Ticket> =>
    assigneeNamesOf([ticket.assigneeId]).then((names) =>
        presentTicket(ticket, viewerOf(context.caller, names).of(ticket))
    );

/**
 * Load a ticket the caller may work, or the refusal that tells them why not. A ticket outside the
 * caller's jurisdiction is a 404; one inside it that they may not act on is a 403.
 *
 * @param id - the ticket
 * @param context - the caller
 */
const loadWorkable = (
    id: string,
    context: CallerContext
): Promise<{ ticket: TicketDocument } | { refusal: ResponseReject }> =>
    ticketRepository.findById(id).then((ticket) => {
        if (!ticket || !inJurisdiction(context.caller, ticket)) return { refusal: notFound() };
        if (!mayWork(context.caller, ticket))
            return { refusal: generateReject(403, [t('generic.error-forbidden')]) };
        return { ticket };
    });

/**
 * The 409 for a reopen that collided with a newer open ticket on the same dedup key.
 *
 * @param ticket - the ticket being reopened
 */
const superseded = (ticket: TicketDocument): Promise<ResponseReject> =>
    ticketRepository
        .findOpenByKey(`${ticket.kind}:${ticket.link?.type ?? ''}:${ticket.link?.id ?? ''}`)
        .then((newer) =>
            generateReject(409, [
                {
                    code: ERROR_CODES.TICKET_SUPERSEDED,
                    message: t('tickets.superseded'),
                    ...(newer ? { details: { ticketId: String(newer._id) } } : {})
                }
            ])
        );

/**
 * Apply one door. The write is conditional on the status that was read; losing the race re-reads
 * and either answers the 409 the new state earns or tries the door again from where the ticket now
 * stands.
 *
 * @param door - which door
 * @param id - the ticket
 * @param context - the caller
 * @param attempts - how many re-reads remain
 */
const move = (
    door: Door,
    id: string,
    context: CallerContext,
    attempts = 3
): Promise<ResponseSuccess<Ticket> | ResponseReject> =>
    loadWorkable(id, context).then((loaded) => {
        if ('refusal' in loaded) return loaded.refusal;

        const { ticket } = loaded;
        const decision = DOORS[door].rule(factsOf(ticket), new Date());
        if ('refusal' in decision) {
            const { code, key } = REFUSALS[decision.refusal];
            return generateReject(409, [{ code, message: t(key) }]);
        }

        return ticketRepository
            .moveFrom(id, ticket.status, decision.patch)
            .then((moved) => {
                if (!moved)
                    return attempts > 1
                        ? move(door, id, context, attempts - 1)
                        : generateReject(409, [
                              {
                                  code: ERROR_CODES.TICKET_ALREADY_OPEN,
                                  message: t('tickets.already-open')
                              }
                          ]);

                recordAudit(context, {
                    action: ticketsAuditActions[DOORS[door].audit],
                    outcome: 'success',
                    targetType: 'ticket',
                    targetId: id,
                    metadata: { from: ticket.status, to: moved.status }
                });
                return present(moved, context).then((wire) => generateSuccess(wire));
            })
            .catch((error: unknown) => {
                if (door === 'reopen' && isDuplicateKey(error)) return superseded(ticket);
                throw error;
            });
    });

/**
 * Whether a person may be given a ticket: they exist, are live, and hold the permission set that
 * works it.
 *
 * @param userId - the proposed assignee
 * @param routeSet - the ticket's route set
 */
const mayBeAssigned = (userId: string, routeSet: string): Promise<boolean> =>
    userService.getById(userId).then((user) => {
        if (!user || user.deletedAt) return false;
        return accessService
            .rolesOf(userId, DEPLOYMENT_TENANT_ID)
            .then(({ tenant }) => roleHoldsRouteSet(tenant, routeSet));
    });

/**
 * Tell the bus a colleague was given a ticket. Taking your own does not: you know. The emit never
 * rejects (a failing subscriber is logged by the bus), so the assignment already made stands.
 *
 * @param ticket - the ticket as assigned
 * @param assigneeId - who now holds it
 * @param context - the caller who assigned it
 */
const announceAssigned = (
    ticket: TicketDocument,
    assigneeId: string,
    context: CallerContext
): Promise<void> =>
    assigneeId === context.caller.id
        ? Promise.resolve()
        : emitDomainEvent(TICKET_ASSIGNED, {
              tenantId: DEPLOYMENT_TENANT_ID,
              ticketId: String(ticket._id),
              kind: ticket.kind,
              routeSet: ticket.routeSet,
              assigneeId,
              assignedAt: new Date().toISOString()
          }).then(() => undefined);

/**
 * Give an open ticket to one person — taking it is assigning yourself. A `new` ticket becomes
 * `in_progress`.
 *
 * @param id - the ticket
 * @param userId - who gets it
 * @param context - the caller
 */
const assign = (
    id: string,
    userId: string,
    context: CallerContext
): Promise<ResponseSuccess<Ticket> | ResponseReject> =>
    loadWorkable(id, context).then((loaded) => {
        if ('refusal' in loaded) return loaded.refusal;

        const { ticket } = loaded;
        if (!isOpen(ticket.status)) return notOpen();

        return mayBeAssigned(userId, ticket.routeSet).then((allowed) => {
            if (!allowed)
                return generateReject(422, [
                    {
                        code: ERROR_CODES.TICKET_ASSIGNEE_INVALID,
                        message: t('tickets.assignee-invalid')
                    }
                ]);

            return ticketRepository.assign(id, userId).then((assigned) => {
                if (!assigned) return notOpen();
                recordAudit(context, {
                    action: ticketsAuditActions.ADMIN_TICKET_ASSIGNED,
                    outcome: 'success',
                    targetType: 'ticket',
                    targetId: id,
                    metadata: { assigneeId: userId }
                });
                return announceAssigned(assigned, userId, context).then(() =>
                    present(assigned, context).then((wire) => generateSuccess(wire))
                );
            });
        });
    });

/**
 * Give a ticket back. An `in_progress` ticket goes back to `new`. Answers the ticket whether or
 * not anyone held it.
 *
 * @param id - the ticket
 * @param context - the caller
 */
const unassign = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<Ticket> | ResponseReject> =>
    loadWorkable(id, context).then((loaded) => {
        if ('refusal' in loaded) return loaded.refusal;

        return ticketRepository.unassign(id).then((released) => {
            if (!released) return notFound();
            recordAudit(context, {
                action: ticketsAuditActions.ADMIN_TICKET_UNASSIGNED,
                outcome: 'success',
                targetType: 'ticket',
                targetId: id
            });
            return present(released, context).then((wire) => generateSuccess(wire));
        });
    });

/**
 * Append a note to the staff thread. Allowed on a closed ticket too: what staff learn after a
 * close is still worth writing down.
 *
 * @param id - the ticket
 * @param body - the note
 * @param context - the caller, who becomes its author
 */
const addNote = (
    id: string,
    body: string,
    context: CallerContext
): Promise<ResponseSuccess<Ticket> | ResponseReject> =>
    loadWorkable(id, context).then((loaded) => {
        if ('refusal' in loaded) return loaded.refusal;

        // An API key has no account to name; its note carries no author.
        const callerId = context.caller.id;
        const authorId =
            callerId && Types.ObjectId.isValid(callerId) ? toObjectId(callerId) : undefined;
        return ticketRepository
            .appendNote(id, {
                ...(authorId === undefined ? {} : { authorId }),
                body: body.trim(),
                at: new Date()
            })
            .then((noted) => {
                if (!noted) return notFound();
                recordAudit(context, {
                    action: ticketsAuditActions.ADMIN_TICKET_NOTED,
                    outcome: 'success',
                    targetType: 'ticket',
                    targetId: id
                });
                return present(noted, context).then((wire) => generateSuccess(wire));
            });
    });

/**
 * The staff badge: open, the caller's own, overdue and unassigned tickets, inside their
 * jurisdiction. Four counts on the indexes of the queue.
 *
 * @param context - the caller
 */
const summary = (context: CallerContext): Promise<TicketSummary> => {
    const { caller } = context;
    const open = { $and: [jurisdictionScope(caller), { status: { $in: OPEN_STATUSES } }] };
    const mine =
        caller.id === null
            ? Promise.resolve(0)
            : ticketRepository.count({
                  $and: [...open.$and, { assigneeId: toObjectId(caller.id) }]
              });

    return Promise.all([
        ticketRepository.count(open),
        mine,
        ticketRepository.count({ $and: [...open.$and, { dueAt: { $lt: new Date() } }] }),
        ticketRepository.count({ $and: [...open.$and, { assigneeId: { $exists: false } }] })
    ]).then(([openCount, mineCount, overdue, unassigned]) => ({
        open: openCount,
        mine: mineCount,
        overdue,
        unassigned
    }));
};

/** The doors, for `ticketService`. */
export const workflow = {
    resolve: (id: string, context: CallerContext) => move('resolve', id, context),
    markSpam: (id: string, context: CallerContext) => move('markSpam', id, context),
    reopen: (id: string, context: CallerContext) => move('reopen', id, context),
    assign,
    unassign,
    addNote,
    summary
};
