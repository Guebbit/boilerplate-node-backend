/**
 * @module
 * The hand-over: a contact message becomes a Zammad ticket without the visitor's request ever
 * waiting on Zammad. `accept` stores a pending row and nudges; the sweep (and the nudge) claim a
 * row, send it, and either delete it (the ticket exists) or push it out by the outbox's backoff. After
 * the last retry the message falls back to basic mode: the to-do and the link-only mail.
 *
 * @see docs/modules/zammad.md#the-hand-over
 */

import { TaskCategory } from '@types';
import type { CreateContactTaskRequest } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import { getDefaultLocale } from '@infrastructure/i18n';
import { FRONTEND_LINK_RULES, frontendLink } from '@infrastructure/http/frontend-link';
import { normalizeEmail } from '@infrastructure/persistence/normalize-email';
import { outboxBackoffMs } from '@kernel/outbox';
import { outboxConfig } from '@kernel/config';
import { taskService, type ContactMessage } from '@modules/tasks';
import { userService } from '@modules/users';
import {
    createTicket,
    findTicketByRef,
    finishSpamTicket,
    ZammadRequestError,
    type CreatedTicket
} from '../client';
import { zammadEnabled, zammadSettings } from '../config';
import { queueRaceErasure } from './erase-job';
import type { ZammadContactDocument } from '../model';
import {
    addPendingContact,
    claimDueContact,
    deleteContactById,
    findCustomer,
    holdsContact,
    rescheduleContact,
    tombstoneContact,
    upsertCustomer
} from '../repository';

/** The most rows one pass hands over, so a backlog cannot hold a minute-long job for an hour. */
const PASS_LIMIT = 100;

/**
 * Who sent the message, as far as Zammad may be told. An account is linked only under the
 * signed-in-sender rule: the sender was signed in AND the address they typed is the account's
 * verified one. Anything else is a customer keyed by the typed address alone.
 */
interface Sender {
    /** The linked account, when the rule holds. */
    userId?: string;
    /** The Zammad customer that account is already mapped to, when it is. */
    zammadUserId?: number;
}

/**
 * Apply the signed-in-sender rule to a pending row.
 *
 * @param row - the claimed message
 */
const senderOf = (row: ZammadContactDocument): Promise<Sender> => {
    if (!row.subjectId) return Promise.resolve({});
    const userId = String(row.subjectId);
    return userService.getById(userId).then((user) => {
        const linked =
            user?.verifiedAt && row.email !== undefined && normalizeEmail(user.email) === row.email;
        if (!linked) return {};
        return findCustomer(userId).then((mapping) => ({
            userId,
            ...(mapping ? { zammadUserId: mapping.zammadUserId } : {})
        }));
    });
};

/**
 * Send one claimed message: look the ticket up first when an earlier attempt's outcome is
 * unknown, otherwise create it.
 *
 * @param row - the claimed message
 * @param sender - who it may be linked to
 * @throws {ZammadRequestError} when Zammad does not take it
 */
const sendTicket = (row: ZammadContactDocument, sender: Sender): Promise<CreatedTicket> => {
    const requestRef = String(row._id);
    const create = (): Promise<CreatedTicket> =>
        createTicket({
            customer:
                sender.zammadUserId === undefined
                    ? { email: row.email ?? '' }
                    : { id: sender.zammadUserId },
            ...(row.name ? { name: row.name } : {}),
            subject: row.subject ?? '',
            message: row.message ?? '',
            ...(row.category ? { category: row.category } : {}),
            ...(row.orderNumber ? { orderNumber: row.orderNumber } : {}),
            senderVerified: sender.userId !== undefined,
            requestRef,
            ...(row.suspectedSpam ? { suspectedSpam: true } : {}),
            ...(sender.userId
                ? {
                      accountLink: frontendLink(
                          FRONTEND_LINK_RULES.staffPages.user,
                          getDefaultLocale(),
                          { id: sender.userId }
                      )
                  }
                : {})
        });

    /**
     * A ticket an earlier unclear attempt filed is found, not filed again; a spam one is closed
     * and tagged again too, since the lost attempt may have died between the create and either.
     */
    const settings = zammadSettings();
    const adopt = (found: CreatedTicket): Promise<CreatedTicket> =>
        row.suspectedSpam && settings ? finishSpamTicket(settings, found) : Promise.resolve(found);
    return row.unclear
        ? findTicketByRef(requestRef).then((found) => (found ? adopt(found) : create()))
        : create();
};

/**
 * The ticket exists: delete the row, then remember the customer. The delete is by id and decides
 * the erasure race: a row already gone means the account was erased while the call was in flight, so
 * nothing is mapped and an erase job deletes the customer the ticket created.
 *
 * @param row - the claimed message
 * @param sender - who it was linked to
 * @param ticket - what Zammad answered
 */
const settle = (
    row: ZammadContactDocument,
    sender: Sender,
    ticket: CreatedTicket
): Promise<void> => {
    if (!ticket.refKept)
        logger.error({
            message: 'zammad: the ticket answer carries no request_ref; run `npm run zammad:setup`',
            ticketId: ticket.id
        });

    return deleteContactById(String(row._id)).then((deleted) => {
        if (!deleted) {
            /**
             * The customer is deleted only when it is the erased person's: the sender was linked to
             * the account (typed its verified address), or there was no account at all and the row
             * went by its verified address. A signed-in sender who typed someone else's address made
             * a customer that is the STRANGER's; deleting it would erase their tickets.
             */
            if (sender.userId !== undefined || !row.subjectId) {
                logger.warn({
                    message: 'zammad: a message was handed over after its account was erased',
                    zammadCustomerId: ticket.customerId
                });
                return queueRaceErasure(ticket.customerId, sender.userId);
            }
            logger.error({
                message:
                    'zammad: a message was handed over after its account was erased, to a customer that is not the account’s',
                zammadCustomerId: ticket.customerId
            });
            return;
        }
        return sender.userId
            ? upsertCustomer(sender.userId, ticket.customerId).then(() => undefined)
            : undefined;
    });
};

/**
 * Narrow the stored category back to the contract's enum: a value outside it (the enum shrank
 * since the row was written) is dropped rather than refiled under a wrong one.
 *
 * @param category - the stored text
 */
const categoryOf = (category: string | undefined): CreateContactTaskRequest['category'] =>
    Object.values(TaskCategory).find((known) => known === category);

/**
 * The last retry failed: hand the message back to basic mode. The to-do is filed and the link-only
 * mail goes to the support mailbox; the row becomes a tombstone the fallback alert counts.
 * Skipped when an erasure already deleted the row, so an erased person's words never come back.
 *
 * @param row - the claimed message
 */
const fallBack = (row: ZammadContactDocument): Promise<void> => {
    const id = String(row._id);
    const token = row.leaseToken ?? '';

    return holdsContact(id, token).then((held) => {
        if (!held) return;
        const category = categoryOf(row.category);
        return taskService
            .create(
                {
                    ...(row.name ? { name: row.name } : {}),
                    email: row.email ?? '',
                    subject: row.subject ?? '',
                    message: row.message ?? '',
                    ...(category ? { category } : {}),
                    ...(row.orderNumber ? { orderNumber: row.orderNumber } : {})
                },
                row.subjectId ? String(row.subjectId) : undefined
            )
            .then(() => tombstoneContact(id, token))
            .then(() => {
                logger.error({ message: 'zammad: a contact message fell back to basic mode' });
            });
    });
};

/**
 * An attempt failed. Count it, and either schedule the next by the outbox's backoff or fall back
 * after the last. An unclear outcome stays unclear for every later attempt: the ticket may exist.
 *
 * @param row - the claimed message
 * @param error - what went wrong
 * @param ticketMayExist - the call to Zammad had already succeeded when this went wrong (the row
 *   could not be settled), so the next attempt must look the ticket up first
 */
const failed = (
    row: ZammadContactDocument,
    error: unknown,
    ticketMayExist = false
): Promise<void> => {
    const attempts = row.attempts + 1;
    const unclear =
        row.unclear || ticketMayExist || (error instanceof ZammadRequestError && error.unclear);
    logger.warn({
        message: 'zammad: handing a message over failed',
        attempts,
        unclear,
        status: error instanceof ZammadRequestError ? error.status : undefined
    });

    if (attempts >= outboxConfig().NODE_OUTBOX_MAX_ATTEMPTS) return fallBack(row);

    return rescheduleContact(String(row._id), row.leaseToken ?? '', {
        attempts,
        unclear,
        nextAttemptAt: new Date(Date.now() + outboxBackoffMs(attempts))
    }).then(() => undefined);
};

/**
 * Hand one claimed message over.
 *
 * @param row - the claimed message
 */
const handOver = (row: ZammadContactDocument): Promise<void> =>
    senderOf(row).then(
        (sender) =>
            sendTicket(row, sender).then(
                // A failure while settling comes AFTER Zammad took the ticket: it may exist.
                (ticket) =>
                    settle(row, sender, ticket).catch((error: unknown) => failed(row, error, true)),
                (error: unknown) => failed(row, error)
            ),
        (error: unknown) => failed(row, error)
    );

/**
 * Claim and hand over due messages, one at a time, up to `remaining`.
 *
 * @param remaining - how many more this pass may take
 * @returns how many were handled
 */
const drain = (remaining: number): Promise<number> =>
    remaining === 0
        ? Promise.resolve(0)
        : claimDueContact().then((row) =>
              row
                  ? handOver(row)
                        .then(() => drain(remaining - 1))
                        .then((handled) => handled + 1)
                  : 0
          );

/**
 * The scheduled pass: hand over every message that is due. Inert while the URL is unset.
 *
 * @returns how many messages it handled
 */
export const sweepContacts = (): Promise<number> =>
    zammadEnabled() ? drain(PASS_LIMIT) : Promise.resolve(0);

/** Passes started by a nudge that have not finished yet. */
const nudges = new Set<Promise<unknown>>();

/**
 * Start a pass without waiting for it, right after a message is stored, so the ticket exists in
 * moments instead of at the next sweep. Never throws: a failed nudge only means the sweep does it.
 */
const nudge = (): void => {
    const pass: Promise<unknown> = sweepContacts().catch((error: unknown) => {
        logger.warn({ message: 'zammad: the nudge failed, the sweep will retry', error });
    });
    nudges.add(pass);
    // Two-armed `then`: cannot reject, and `Promise.all(nudges)` still sees `pass` itself.
    const release = () => nudges.delete(pass);
    pass.then(release, release);
};

/**
 * Wait for every nudged pass to finish: for a test that needs the hand-over done before it asserts.
 */
export const settleHandovers = (): Promise<void> =>
    nudges.size === 0 ? Promise.resolve() : Promise.all(nudges).then(() => settleHandovers());

/**
 * The port's `accept`: store the message for hand-over and nudge. `false` while the module is
 * inert, so `tasks` files the to-do as in basic mode.
 *
 * @param message - the screened contact message
 */
export const acceptContact = (message: ContactMessage): Promise<boolean> => {
    if (!zammadEnabled()) return Promise.resolve(false);
    return addPendingContact(message).then(() => {
        nudge();
        return true;
    });
};
