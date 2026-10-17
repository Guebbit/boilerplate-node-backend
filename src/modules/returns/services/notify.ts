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
        const at = found.createdAt ?? new Date();
        const withdrawal = found.reason === 'withdrawal';
        if (found.closedAt && !found.receivedAt)
            return withdrawal
                ? sendNotice('withdrawal-acknowledged', found, { at })
                : Promise.resolve();

        return sendNotice(withdrawal ? 'withdrawal-acknowledged' : 'return-requested', found, {
            returnPostage: found.returnPostage,
            at,
            // A withdrawal is approved from the start, so the customer is told where to send the
            // goods in the same mail; any other reason hears it once staff approve.
            ...(withdrawal ? { returnAddress: returnAddress() } : {})
        });
    });

/**
 * Tell the customer what staff decided.
 * @param payload - the `return.decided` fact
 */
export const mailReturnDecided = ({
    returnId,
    decision
}: DomainEventMap['return.decided']): Promise<void> =>
    withReturn(returnId, (found) =>
        sendNotice(decision === 'approved' ? 'return-approved' : 'return-declined', found, {
            returnPostage: found.returnPostage,
            at: found.decidedAt ?? new Date(),
            declineReason: found.declineReason,
            // Told where to send the goods only when they are being asked for.
            ...(decision === 'approved' ? { returnAddress: returnAddress() } : {})
        })
    );

/**
 * Tell the customer their money went back. Only a return whose goods were received is mailed: one
 * born closed was acknowledged when it opened, and its refund has its own notice from `payments`.
 * @param payload - the `return.closed` fact
 */
export const mailReturnClosed = ({
    returnId,
    refundAmount,
    currency
}: DomainEventMap['return.closed']): Promise<void> =>
    withReturn(returnId, (found) =>
        found.receivedAt
            ? sendNotice('return-closed', found, {
                  returnPostage: found.returnPostage,
                  at: found.closedAt ?? new Date(),
                  refund: { amount: refundAmount, currency }
              })
            : Promise.resolve()
    );
