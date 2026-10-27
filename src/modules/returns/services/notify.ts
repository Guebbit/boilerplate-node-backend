/**
 * @module
 * Mailing the customer about a return or a withdrawal, from a listener on this module's own
 * events: `return.requested` (the acknowledgement), `return.decided` (approved or declined) and
 * `return.closed` (the money went back). `orders`' own buyer-mail policy (`mailBuyerOfOrder`)
 * looks the buyer up for their language, with this module's copy. A listener covers every way a
 * return is opened, decided or closed, and a mail that fails never undoes one: each logs and
 * swallows.
 */

import { logger } from '@infrastructure/adapters/logger';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import type { DomainEventMap } from '@kernel/events';
import { orderService } from '@modules/orders';
import { returnAddress } from '@modules/shop';
import { isGuaranteeReason } from '../domain';
import { returnNoticeEmail, type ReturnNoticeInput, type ReturnNoticeKind } from '../emails';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';

/**
 * Read the return an event is about, then hand it to `send`. Never rejects: a listener that
 * rejects makes the relay deliver the event again, and a mail that failed is not worth that.
 * @param returnId - the return the event names
 * @param send - given the return as it stands now, queues the mail
 */
const withReturn = (
    returnId: string,
    send: (found: ReturnDocument) => Promise<void>
): Promise<void> =>
    returnRepository
        .findById(returnId)
        .then((found) => (found ? send(found) : undefined))
        .catch((error: unknown) => {
            // Stryker disable all
            logger.error({
                message: `Returns: could not mail the customer about return ${returnId}`,
                error
            });
            // Stryker restore all
        });

/**
 * Send one notice about a return's order, in the buyer's own language.
 * @param kind - which notice
 * @param found - the return it is about
 * @param input - what fills the copy; the order reference is derived here
 */
const sendNotice = (
    kind: ReturnNoticeKind,
    found: ReturnDocument,
    input: Omit<ReturnNoticeInput, 'orderRef'>
): Promise<void> =>
    orderService.mailBuyerOfOrder(String(found.orderId), (order, locale, name) => {
        const mail = returnNoticeEmail(kind, locale, name, {
            ...input,
            orderRef: order.orderNumber
        });
        // eslint-disable-next-line @typescript-eslint/no-floating-promises -- enqueueEmail never rejects (it logs its own failure)
        void enqueueEmail({ to: order.email, subject: mail.subject }, mail.template, mail.data);
    });

/**
 * Acknowledge a return that was just opened. A withdrawal gets the Art. 11a acknowledgement; any
 * other reason a plain "received". A return born closed (a withdrawal before dispatch, or a
 * remainder cancel) expects no goods back, so its acknowledgement carries no postage line and no
 * address, and only the buyer's own withdrawal is acknowledged at all.
 * @param payload - the `return.requested` fact
 */
export const mailReturnRequested = ({
    returnId
}: DomainEventMap['return.requested']): Promise<void> =>
    withReturn(returnId, (found) => {
        // The day the buyer acted, not the day the shop recorded it.
        const at = found.requestedAt;
        const withdrawal = found.reason === 'withdrawal';
        // Staff opened it for the buyer: `return.decided` tells them once, with the address.
        if (found.openedBy === 'staff' && !withdrawal) return Promise.resolve();

        const kind = found.openedBy === 'staff' ? 'withdrawal-recorded' : 'withdrawal-acknowledged';
        const recorded = {
            recorded: { via: found.statedVia ?? 'other', at: found.createdAt ?? new Date() }
        };
        if (found.closedAt && !found.receivedAt)
            return withdrawal
                ? sendNotice(kind, found, {
                      at,
                      ...(kind === 'withdrawal-recorded' ? recorded : {})
                  })
                : Promise.resolve();

        return sendNotice(withdrawal ? kind : 'return-requested', found, {
            returnPostage: found.returnPostage,
            at,
            remedyChoice: isGuaranteeReason(found.reason),
            ...(kind === 'withdrawal-recorded' && withdrawal ? recorded : {}),
            // A withdrawal is approved from the start, so the customer is told where to send the
            // goods in the same mail; any other reason hears it once staff approve.
            ...(withdrawal ? { returnAddress: returnAddress() } : {})
        });
    });

/**
 * Which notice answers a decision: a decline, an approval, or — when staff opened the return after
 * the buyer's request — the one that says so.
 * @param found - the return
 * @param decision - what staff decided
 */
const decidedNoticeOf = (
    found: ReturnDocument,
    decision: 'approved' | 'declined'
): ReturnNoticeKind => {
    if (decision === 'declined') return 'return-declined';
    return found.openedBy === 'staff' ? 'return-opened' : 'return-approved';
};

/**
 * Tell the customer what staff decided.
 * @param payload - the `return.decided` fact
 */
export const mailReturnDecided = ({
    returnId,
    decision
}: DomainEventMap['return.decided']): Promise<void> =>
    withReturn(returnId, (found) =>
        sendNotice(decidedNoticeOf(found, decision), found, {
            returnPostage: found.returnPostage,
            // A return staff opened for the buyer is dated by the buyer's own request.
            at: found.openedBy === 'staff' ? found.requestedAt : (found.decidedAt ?? new Date()),
            declineReason: found.declineReason,
            declineMessage: found.declineMessage,
            remedyChoice: decision === 'approved' && isGuaranteeReason(found.reason),
            // Told where to send the goods only when they are being asked for.
            ...(decision === 'approved' ? { returnAddress: returnAddress() } : {})
        })
    );

/**
 * Which notice a close sends: the money went back, a replacement is on its way, or the item is
 * being repaired.
 * @param remedy - what the buyer was given
 */
const closedNoticeOf = (remedy: DomainEventMap['return.closed']['remedy']): ReturnNoticeKind => {
    if (remedy === 'replace') return 'return-replaced';
    return remedy === 'repair' ? 'return-repaired' : 'return-closed';
};

/**
 * Tell the customer their money went back — or, for a replacement or a repair, that one is
 * coming. Only a return whose goods were received is mailed: one born closed was acknowledged
 * when it opened, and its refund has its own notice from `payments`.
 * @param payload - the `return.closed` fact
 */
export const mailReturnClosed = ({
    returnId,
    refundAmount,
    currency,
    remedy
}: DomainEventMap['return.closed']): Promise<void> =>
    withReturn(returnId, (found) =>
        found.receivedAt
            ? sendNotice(closedNoticeOf(remedy), found, {
                  returnPostage: found.returnPostage,
                  at: found.closedAt ?? new Date(),
                  refund: { amount: refundAmount, currency }
              })
            : Promise.resolve()
    );
