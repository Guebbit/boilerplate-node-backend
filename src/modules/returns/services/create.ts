/**
 * @module
 * Opening a return — and the withdrawal button, which is this same call. It always answers with a
 * `Return`; where the goods are decides what that record is:
 *
 * - Before dispatch the order is still in the shop's hands, so a withdrawal is `orders`' own cancel
 *   — which already refunds in full and releases the stock hold — plus a `Return` written closed at
 *   birth: no lines (no goods are expected back), the refund owed, the Art. 11a acknowledgement
 *   mailed (`./withdraw`). One refund path; the record is the dated proof of the withdrawal.
 * - Once something has shipped there is something to send back: a return is written open, with
 *   the lines and quantities coming back (never more than shipped and not already returned), and
 *   staff see it. What has NOT shipped is cancelled one fulfillment order at a time
 *   (`./cancel-remainder`, `kind: cancellation`).
 *
 * See: docs/modules/returns.md#the-withdrawal-button
 */

import { Types } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { generateReject } from '@infrastructure/http/response';
import type { ClientSession } from 'mongoose';
import { withTransaction } from '@infrastructure/runtime/database';
import { nudgeOutbox } from '@kernel/outbox';
import { orderService, isBeforeDispatch, isExcludedFromWithdrawal } from '@modules/orders';
import { shippedQuantities } from '@modules/delivery';
import type { OrderDocument } from '@modules/orders';
import type { AuthContext, CallerContext } from '@types';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import {
    checkRequestedLines,
    holdsReturnedGoods,
    initialStatusFor,
    returnableQuantities,
    wireLines
} from '../domain';
import type { ProductQuantity } from '../domain';
import { mailReturnNotice } from './notify';
import { ownOrder } from './ownership';
import { syncReturnStatus } from './projection';
import { createCancellation } from './cancel-remainder';
import { withdrawBeforeDispatch } from './withdraw';
import {
    badCancellation,
    badLines,
    notReturnable,
    recordOpened,
    opened,
    enqueueRequested,
    windowClosed,
    type CreateReturnInput,
    type CreateReturnOutcome
} from './outcome';
import { returnAddress, returnPostagePayer } from '@modules/shop';

export type { CreateReturnInput, CreateReturnOutcome } from './outcome';

/**
 * The lines already coming back on an order — what a new return's quantities are checked against.
 * A cancellation holds nothing that comes back (its units never shipped), so it is not counted.
 * @param orderId - the order
 * @param session - the opening's transaction, so the read happens under the order's lock
 */
const alreadyReturned = (orderId: string, session: ClientSession): Promise<ProductQuantity[]> =>
    returnRepository
        .findByOrderId(orderId, session)
        .then((returns) =>
            returns.filter(holdsReturnedGoods).flatMap(({ lines }) => wireLines(lines))
        );

/**
 * The order's timeline rows for a return that was just opened: `return_requested`, and for a
 * withdrawal — opened already approved, since nobody grants a right — `return_approved` too. Only
 * the reason code rides along; the buyer's own note stays on the return.
 *
 * @param created - the return just written
 * @param session - the opening's transaction
 */
const appendOpened = async (created: ReturnDocument, session: ClientSession): Promise<void> => {
    const orderId = String(created.orderId);
    const data = { returnId: String(created._id), reason: created.reason };
    await orderService.appendTimeline(orderId, { type: 'return_requested', data }, session);
    if (created.status === 'approved')
        await orderService.appendTimeline(orderId, { type: 'return_approved', data }, session);
};

/**
 * Write the return once its lines are decided: freeze what is coming back, and write
 * `return.requested` with it. Waking the relay is the caller's job, after the commit.
 *
 * @param order - the order the goods came from
 * @param input - the customer's request
 * @param lines - the lines {@link checkRequestedLines} accepted
 * @param session - the opening's transaction
 */
const writeReturn = (
    order: OrderDocument,
    input: CreateReturnInput,
    lines: readonly ProductQuantity[],
    session: ClientSession
): Promise<ReturnDocument> => {
    const byProduct = new Map(order.items.map((item) => [String(item.product._id), item]));

    return returnRepository
        .create(
            {
                orderId: order._id,
                orderNumber: order.orderNumber,
                currency: order.currency,
                status: initialStatusFor(input.reason),
                reason: input.reason,
                ...(input.note ? { note: input.note } : {}),
                lines: lines.map(({ productId, quantity }) => {
                    // `checkRequestedLines` only accepts products the order holds, so this is present.
                    const item = byProduct.get(productId)!;
                    return {
                        productId: new Types.ObjectId(productId),
                        quantity,
                        title: item.product.title,
                        unitPrice: item.product.price
                    };
                }),
                returnPostage: returnPostagePayer(),
                // A withdrawal is opened already decided — there is nothing for staff to decide.
                ...(input.reason === 'withdrawal' ? { decidedAt: new Date() } : {})
            },
            session
        )
        .then((created) => enqueueRequested(created, session).then(() => created))
        .then((created) => appendOpened(created, session).then(() => created));
};

/**
 * Check the request against what shipped and is not already coming back, and write the return — all
 * under the order's lock row, in one transaction. Two parallel openings would otherwise both read
 * "nothing returned yet" (snapshot isolation) and both commit a full return.
 *
 * @param order - the order the goods came from
 * @param input - the customer's request
 * @param shipped - what has shipped from the order, per product, excluded goods already removed
 * @returns the outcome; nothing is announced yet, the transaction has to commit first
 */
const openUnderLock = (
    order: OrderDocument,
    input: CreateReturnInput,
    shipped: readonly ProductQuantity[]
): Promise<CreateReturnOutcome> =>
    withTransaction((session) =>
        returnRepository
            .lockOrder(input.orderId, session)
            .then(() => alreadyReturned(input.orderId, session))
            .then((earlier) => {
                const verdict = checkRequestedLines(
                    returnableQuantities(shipped, earlier),
                    input.lines
                );
                if (!verdict.ok) return badLines(verdict.reason);

                return writeReturn(order, input, verdict.lines, session).then(
                    (created): CreateReturnOutcome => opened(created)
                );
            })
    );

/**
 * Everything opening a return unlocks: the acknowledgement mail — the Art. 11a one for a
 * withdrawal, a plain "received" for any other reason — after the order's return status is
 * brought in step.
 * @param order - the order the goods came from
 * @param created - the return just written
 * @param context - for audit
 */
const announceOpened = (
    order: OrderDocument,
    created: ReturnDocument,
    context: CallerContext
): Promise<CreateReturnOutcome> => {
    recordOpened(order, created, context);

    return syncReturnStatus(String(order._id))
        .then(() =>
            mailReturnNotice(
                created.reason === 'withdrawal' ? 'withdrawal-acknowledged' : 'return-requested',
                order,
                {
                    returnPostage: created.returnPostage,
                    at: created.createdAt ?? new Date(),
                    // A withdrawal is approved from the start, so the customer is told where to send the
                    // goods in the same mail; any other reason hears it once staff approve.
                    ...(created.reason === 'withdrawal' ? { returnAddress: returnAddress() } : {})
                }
            )
        )
        .then((): CreateReturnOutcome => opened(created));
};

/**
 * Open a return of goods that shipped — `createReturn`'s `kind: return` branch.
 *
 * @param input - the customer's request
 * @param authContext - the buyer; only they may exercise the right
 * @param context - for audit
 */
const openReturn = (
    input: CreateReturnInput,
    authContext: AuthContext,
    context: CallerContext
): Promise<CreateReturnOutcome> =>
    ownOrder(input.orderId, authContext).then((order) => {
        if (!order) return generateReject(404, [t('returns.order-not-found')]);

        const now = new Date();
        if (order.withdrawUntil && now.getTime() > order.withdrawUntil.getTime())
            return windowClosed();

        // Art. 16: goods the product marks as excluded cannot be withdrawn from. A cancel before
        // dispatch takes the whole order, so one such line keeps the whole withdrawal out.
        const excluded = new Set(
            order.items
                .filter((item) => isExcludedFromWithdrawal(item))
                .map((item) => String(item.product._id))
        );
        if (input.reason === 'withdrawal' && isBeforeDispatch(order))
            return excluded.size > 0
                ? badLines('excluded')
                : withdrawBeforeDispatch(order, input, authContext, context, () =>
                      openReturn(input, authContext, context)
                  );

        // Past this point goods are on their way or arrived — or nothing has shipped and the
        // reason is not a withdrawal, so there is nothing to send back.
        return shippedQuantities(input.orderId).then((shipped) => {
            if (shipped.length === 0) return notReturnable();

            if (input.lines?.some(({ productId }) => excluded.has(productId)))
                return badLines('excluded');

            const returnable = shipped.filter(({ productId }) => !excluded.has(productId));

            // The mail, the audit row and the order's return status follow the commit: they must
            // not describe a return a lost race never wrote.
            return openUnderLock(order, input, returnable).then((outcome) => {
                if (!outcome.success) return outcome;
                nudgeOutbox();
                return announceOpened(order, outcome.data, context);
            });
        });
    });

/**
 * Open a return, or withdraw — the one call behind `POST /returns`. `kind: cancellation` cancels
 * what has not shipped instead (`./cancel-remainder`).
 *
 * @param input - the customer's request
 * @param authContext - the buyer; only they may exercise the right (staff only cancel)
 * @param context - for audit
 * @returns the outcome: refused, or the return written — open for goods on their way back, closed
 *   at birth for a withdrawal before dispatch or a remainder cancel
 */
export const createReturn = (
    input: CreateReturnInput,
    authContext: AuthContext,
    context: CallerContext
): Promise<CreateReturnOutcome> => {
    if (input.kind === 'cancellation') return createCancellation(input, authContext, context);
    if (input.fulfillmentOrderId !== undefined) return Promise.resolve(badCancellation());
    return openReturn(input, authContext, context);
};
