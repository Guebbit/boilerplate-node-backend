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
 * The buyer opens it. Staff holding `update:Return` open it on the buyer's behalf — the phone call
 * that asks for it — born approved, with what they waived written on the record; and they record a
 * withdrawal the buyer stated outside the shop, judged on the day it was sent.
 *
 * See: docs/modules/returns.md#the-withdrawal-button
 */

import { Types } from 'mongoose';
import { t } from '@infrastructure/i18n';
import { generateReject } from '@infrastructure/http/response';
import type { ClientSession } from 'mongoose';
import { withTransaction } from '@infrastructure/runtime/database';
import { nudgeOutbox } from '@kernel/outbox';
import {
    orderService,
    isBeforeDispatch,
    isExcludedFromWithdrawal,
    withdrawalRefusalOf
} from '@modules/orders';
import { deliveryService } from '@modules/delivery';
import type { OrderDocument } from '@modules/orders';
import { WithdrawBlockedReason } from '@types';
import type { AuthContext, CallerContext } from '@types';
import { returnRepository } from '../repository';
import type { ReturnDocument } from '../model';
import {
    checkRequestedLines,
    checkStatement,
    holdsReturnedGoods,
    isGuaranteeReason,
    isReasonOpen,
    initialStatusFor,
    policyExceptionsOf,
    returnableQuantities,
    wireLines
} from '../domain';
import type { PolicyException, ProductQuantity, Statement } from '../domain';
import { frozenDeadlinesOf } from './deadlines';
import { openableOrder } from './ownership';
import { syncReturnStatus } from './projection';
import { createCancellation } from './cancel-remainder';
import { withdrawBeforeDispatch } from './withdraw';
import {
    badCancellation,
    badLines,
    badRemedy,
    badStatement,
    notReturnable,
    recordOpened,
    opened,
    enqueueApproved,
    enqueueRequested,
    windowClosed,
    type CreateReturnInput,
    type CreateReturnOutcome,
    type Opener
} from './outcome';
import { returnPostagePayer } from '@modules/shop';

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
 * The order's timeline rows for a return that was just opened: `return_requested`, and for one
 * opened already approved — a withdrawal (nobody grants a right) or a return staff opened for the
 * buyer — `return_approved` too. Only the reason code rides along; the buyer's own note stays on
 * the return. A staff opening names the staff member on both rows.
 *
 * @param created - the return just written
 * @param actor - the staff member who opened it for the buyer, when one did
 * @param session - the opening's transaction
 */
const appendOpened = async (
    created: ReturnDocument,
    actor: string | undefined,
    session: ClientSession
): Promise<void> => {
    const orderId = String(created.orderId);
    const data = { returnId: String(created._id), reason: created.reason };
    await orderService.appendTimeline(orderId, { type: 'return_requested', actor, data }, session);
    if (created.status === 'approved')
        await orderService.appendTimeline(
            orderId,
            { type: 'return_approved', actor, data },
            session
        );
};

/** What {@link writeReturn} adds to a request: who opened it, when the buyer asked, what was waived. */
interface Opening extends Statement {
    /** The staff member opening it for the buyer, absent when the buyer does. */
    staffId?: string | undefined;
    policyExceptions: PolicyException[];
}

/**
 * Write the return once its lines are decided: freeze what is coming back, and write
 * `return.requested` with it — and, for one staff opened, `return.decided`, so the buyer is told
 * once, with the address. Waking the relay is the caller's job, after the commit.
 *
 * @param order - the order the goods came from
 * @param input - the request
 * @param lines - the lines {@link checkRequestedLines} accepted
 * @param opening - who opened it, when the buyer asked, and what staff waived
 * @param session - the opening's transaction
 */
const writeReturn = (
    order: OrderDocument,
    input: CreateReturnInput,
    lines: readonly ProductQuantity[],
    opening: Opening,
    session: ClientSession
): Promise<ReturnDocument> => {
    const byProduct = new Map(order.items.map((item) => [String(item.product._id), item]));
    const byStaff = opening.staffId !== undefined;
    const status = initialStatusFor(input.reason, byStaff);

    return returnRepository
        .create(
            {
                orderId: order._id,
                orderNumber: order.orderNumber,
                currency: order.currency,
                status,
                reason: input.reason,
                ...(input.note ? { note: input.note } : {}),
                ...(input.preferredRemedy ? { preferredRemedy: input.preferredRemedy } : {}),
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
                requestedAt: opening.requestedAt,
                ...(opening.statedVia ? { statedVia: opening.statedVia } : {}),
                openedBy: byStaff ? 'staff' : 'buyer',
                policyExceptions: opening.policyExceptions,
                // Opened already decided — a withdrawal, or staff opening it — so there is nothing
                // left for staff to decide.
                ...(status === 'approved' ? { decidedAt: new Date() } : {})
            },
            session
        )
        .then((created) =>
            enqueueRequested(created, session)
                .then(() =>
                    byStaff && input.reason !== 'withdrawal'
                        ? enqueueApproved(created, session)
                        : undefined
                )
                .then(() => created)
        )
        .then((created) => appendOpened(created, opening.staffId, session).then(() => created));
};

/**
 * The ids of the order's lines that are goods Art. 16 takes the right of withdrawal away from.
 * @param order - the order
 */
const excludedProductIds = (order: OrderDocument): Set<string> =>
    new Set(
        order.items
            .filter((item) => isExcludedFromWithdrawal(item))
            .map((item) => String(item.product._id))
    );

/**
 * Whether staff are waiving the shop's rules for this opening: they opened a return for a buyer for
 * the shop's own reason. A withdrawal is not theirs to waive — it keeps its legal window and its
 * Art. 16 exclusion, judged on the day the buyer sent it.
 * @param opener - who is opening it
 * @param reason - the reason on the request
 */
const isWaiver = (opener: Opener, reason: CreateReturnInput['reason']): boolean =>
    opener.staffId !== undefined && reason !== 'withdrawal';

/**
 * Check the request against what shipped and is not already coming back, and write the return — all
 * under the order's lock row, in one transaction. Two parallel openings would otherwise both read
 * "nothing returned yet" (snapshot isolation) and both commit a full return.
 *
 * @param order - the order the goods came from
 * @param input - the request
 * @param shipped - what has shipped from the order, per product, excluded goods already removed
 *   unless staff are waiving that rule
 * @param opener - who opens it and what the buyer stated
 * @returns the outcome; nothing is announced yet, the transaction has to commit first
 */
const openUnderLock = (
    order: OrderDocument,
    input: CreateReturnInput,
    shipped: readonly ProductQuantity[],
    opener: Opener
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

                // Frozen now, like the lines: what staff waived is what was true when they opened it.
                const excluded = excludedProductIds(order);
                const policyExceptions = isWaiver(opener, input.reason)
                    ? policyExceptionsOf(
                          frozenDeadlinesOf(order),
                          input.reason,
                          opener.statement.requestedAt,
                          verdict.lines.some(({ productId }) => excluded.has(productId))
                      )
                    : [];

                return writeReturn(
                    order,
                    input,
                    verdict.lines,
                    { ...opener.statement, staffId: opener.staffId, policyExceptions },
                    session
                ).then((created): CreateReturnOutcome => opened(created));
            })
    );

/**
 * Everything opening a return unlocks: the order's return status brought in step. The
 * acknowledgement mail rides `return.requested`, or `return.decided` for one staff opened.
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

    return syncReturnStatus(String(order._id)).then((): CreateReturnOutcome => opened(created));
};

/**
 * Open a return for an order once the caller and the statement are settled: judge the reason's
 * deadline on the day the buyer asked, cut the excluded goods, then write.
 *
 * @param order - the order the goods came from
 * @param input - the request
 * @param opener - who opens it and what the buyer stated
 * @param authContext - the caller, for the race fallback
 * @param context - for audit
 */
const openFor = (
    order: OrderDocument,
    input: CreateReturnInput,
    opener: Opener,
    authContext: AuthContext,
    context: CallerContext
): Promise<CreateReturnOutcome> => {
    const waiver = isWaiver(opener, input.reason);
    const { requestedAt } = opener.statement;

    // Each reason has its own deadline: the shop's withdrawal period for a withdrawal or a
    // goodwill return, two years from delivery for a defect or a wrong item. Staff opening a return
    // for the shop's own reasons are not stopped by it; the record says they waived it.
    if (!waiver && !isReasonOpen(frozenDeadlinesOf(order), input.reason, requestedAt))
        return Promise.resolve(windowClosed(isGuaranteeReason(input.reason)));

    // Art. 16: goods the product marks as excluded cannot be withdrawn from. Before dispatch the
    // withdrawal takes the eligible goods (`withdraw.ts`), so only an order made wholly of
    // excluded goods is refused. A defect or a wrong item is the guarantee, not the
    // withdrawal: made-to-order goods are covered, and staff may waive the rule for a goodwill one.
    const excluded =
        isGuaranteeReason(input.reason) || waiver ? new Set<string>() : excludedProductIds(order);
    if (input.reason === 'withdrawal' && isBeforeDispatch(order))
        return withdrawalRefusalOf(order, requestedAt) === WithdrawBlockedReason.all_excluded
            ? Promise.resolve(badLines('excluded'))
            : withdrawBeforeDispatch(order, input, opener, authContext, context, () =>
                  openReturn(input, authContext, context)
              );

    // Past this point goods are on their way or arrived — or nothing has shipped and the
    // reason is not a withdrawal, so there is nothing to send back.
    return deliveryService.shippedQuantities(input.orderId).then((shipped) => {
        if (shipped.length === 0) return notReturnable();

        if (input.lines?.some(({ productId }) => excluded.has(productId)))
            return badLines('excluded');

        const returnable = shipped.filter(({ productId }) => !excluded.has(productId));

        // The mail, the audit row and the order's return status follow the commit: they must
        // not describe a return a lost race never wrote.
        return openUnderLock(order, input, returnable, opener).then((outcome) => {
            if (!outcome.success) return outcome;
            nudgeOutbox();
            return announceOpened(order, outcome.data, context);
        });
    });
};

/**
 * Open a return of goods that shipped — `createReturn`'s `kind: return` branch.
 *
 * @param input - the request
 * @param authContext - the buyer, or staff holding `update:Return` acting for them
 * @param context - for audit
 */
const openReturn = (
    input: CreateReturnInput,
    authContext: AuthContext,
    context: CallerContext
): Promise<CreateReturnOutcome> =>
    openableOrder(input.orderId, authContext).then((found) => {
        if (!found) return generateReject(404, [t('returns.order-not-found')]);

        const { order, byStaff } = found;
        const statement = checkStatement({
            byBuyer: !byStaff,
            reason: input.reason,
            kind: 'return',
            requestedAt: input.requestedAt,
            statedVia: input.statedVia,
            // A hand-built order may lack the stamp; it then constrains nothing.
            orderCreatedAt: order.createdAt ?? new Date(0),
            now: new Date()
        });
        if (!statement.ok) return badStatement(statement);

        return openFor(
            order,
            input,
            { statement, staffId: byStaff ? authContext.id : undefined },
            authContext,
            context
        );
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
    // A choice between remedies exists only under the guarantee: a withdrawal and a goodwill
    // return are refunded, so naming one there is a mistake the buyer should hear about.
    if (input.preferredRemedy !== undefined && !isGuaranteeReason(input.reason))
        return Promise.resolve(badRemedy('preferredRemedy'));
    if (input.kind === 'cancellation') return createCancellation(input, authContext, context);
    if (input.fulfillmentOrderId !== undefined) return Promise.resolve(badCancellation());
    return openReturn(input, authContext, context);
};
