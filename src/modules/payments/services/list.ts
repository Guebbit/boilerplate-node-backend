/**
 * @module
 * The staff reads behind the Payments page: the list, the refunds across every payment, and what
 * needs a person. All three are `display:Payment` routes, so every row carries the provider ids.
 *
 * Composition: the list asks `orders` for the page's order numbers and emails in one batch
 * (`orderService.findManyByIds`), the same shape `inventory` uses to name products.
 */

import type {
    AuthContext,
    Payment,
    PaymentAttentionItem,
    RefundListItem,
    SearchPaymentsRequest
} from '@types';
import { PaymentAttentionKind } from '@types';
import {
    buildPaginatedMeta,
    normalizePagination,
    type PaginatedMeta
} from '@infrastructure/persistence/search';
import { orderService } from '@modules/orders';
import { paymentAttentionMinutes } from '../config';
import { displayStatusFilter, parseReference, refundDueBy } from '../domain';
import type { PaymentDocument, RefundRecord } from '../model';
import { paymentRepository, type RefundFilters, type RefundRow } from '../repository';
import { callerScope } from './scope';
import { withActions } from './view';

/** Most rows one needs-attention source contributes. */
const ATTENTION_LIMIT = 100;

/**
 * One stored payment as a staff list row.
 *
 * @param payment - the stored row
 * @param order - its order's number and email, when `orders` knows it
 * @param authContext - the caller, whose `actions` the row carries
 */
const staffRow = (
    payment: PaymentDocument,
    order: { orderNumber: string; email: string } | undefined,
    authContext?: AuthContext
): Payment => ({
    // No order document is read for a list: `pay` is the payer's own step and stays false here, so
    // the row carries the same `actions.refund` the order page's panel does.
    ...withActions(payment, undefined, authContext),
    ...(order ? { orderNumber: order.orderNumber, email: order.email } : {})
});

/**
 * One page of payments, filtered and sorted, with each row's order number and email.
 *
 * A `transferReference` is matched in its canonical form (spacing and case tolerated), and a code
 * that is not a valid RF reference finds nothing: an empty page, so nothing tells a staff member
 * that an almost-right code was close.
 *
 * @param filters - the validated search
 * @param authContext - the caller (already known to hold `display:Payment`)
 */
export const listPayments = (
    filters: SearchPaymentsRequest,
    authContext?: AuthContext
): Promise<{ items: Payment[]; meta: PaginatedMeta }> => {
    const canonical =
        filters.transferReference === undefined
            ? undefined
            : (parseReference(filters.transferReference) ?? null);
    if (canonical === null)
        return Promise.resolve({
            items: [],
            meta: buildPaginatedMeta(normalizePagination(filters), 0)
        });

    return paymentRepository
        .searchStaff(
            canonical === undefined ? filters : { ...filters, transferReference: canonical },
            filters.displayStatus ? displayStatusFilter(filters.displayStatus) : undefined,
            callerScope(authContext)
        )
        .then(({ items, meta }) =>
            orderService.findManyByIds(items.map((item) => String(item.orderId))).then((orders) => {
                const byId = new Map(orders.map((order) => [order.id, order]));
                return {
                    items: items.map((item) =>
                        staffRow(item, byId.get(String(item.orderId)), authContext)
                    ),
                    meta
                };
            })
        );
};

/**
 * One refund as a list row.
 * @param row - the unwound refund
 */
const refundRow = ({ paymentId, orderId, refund }: RefundRow): RefundListItem => ({
    id: String(refund._id),
    paymentId: String(paymentId),
    orderId: String(orderId),
    amount: refund.amount,
    currency: refund.currency,
    status: refund.status,
    reason: refund.reason,
    ...(refund.returnId ? { returnId: refund.returnId } : {}),
    ...(refund.providerRefundRef ? { providerRefundRef: refund.providerRefundRef } : {}),
    ...(refund.failureReason ? { failureReason: refund.failureReason } : {}),
    ...(refund.settledAt ? { settledAt: refund.settledAt.toISOString() } : {}),
    createdAt: refund.createdAt.toISOString()
});

/**
 * One page of refunds across every payment, newest first.
 * @param filters - status, reason, order and date bounds
 */
export const listRefunds = (
    filters: RefundFilters
): Promise<{ items: RefundListItem[]; meta: PaginatedMeta }> =>
    paymentRepository
        .searchRefunds(filters)
        .then(({ items, meta }) => ({ items: items.map((row) => refundRow(row)), meta }));

/**
 * The legal deadline of a refused refund, as the attention row's `refundDueBy` field: nothing for
 * any other kind of row, or for a refund that pays no withdrawal or return.
 *
 * @param kind - which source found the row
 * @param refund - the open refund
 */
const dueByOf = (kind: PaymentAttentionKind, refund: RefundRecord): { refundDueBy?: string } => {
    const due = kind === PaymentAttentionKind.refused_refund ? refundDueBy(refund) : undefined;
    return due ? { refundDueBy: due.toISOString() } : {};
};

/**
 * A needs-attention row from an open refund.
 * @param row - the unwound refund
 * @param kind - which source found it
 */
const refundAttention = (row: RefundRow, kind: PaymentAttentionKind): PaymentAttentionItem => ({
    kind,
    orderId: String(row.orderId),
    paymentId: String(row.paymentId),
    refundId: String(row.refund._id),
    amount: row.refund.amount,
    currency: row.refund.currency,
    ...(row.refund.failureReason ? { failureReason: row.refund.failureReason } : {}),
    since: row.refund.createdAt.toISOString(),
    ...dueByOf(kind, row.refund)
});

/**
 * Every problem still recorded on a payment, oldest first: refunds open past the threshold, refunds the
 * provider refused for good (at once), and refunds owed by hand. A refund owed is always an open record, so a fixed problem has closed it
 * and is not here.
 */
export const listAttention = (): Promise<{ items: PaymentAttentionItem[] }> => {
    const cutoff = new Date(Date.now() - paymentAttentionMinutes() * 60_000);
    return Promise.all([
        paymentRepository.findOpenRefundRows({
            manual: false,
            openBefore: cutoff,
            refusal: 'not-final',
            limit: ATTENTION_LIMIT
        }),
        // A final refusal needs a person now: no waiting for the threshold.
        paymentRepository.findOpenRefundRows({
            manual: false,
            refusal: 'final',
            limit: ATTENTION_LIMIT
        }),
        paymentRepository.findOpenRefundRows({ manual: true, limit: ATTENTION_LIMIT })
    ]).then(([stale, refused, manual]) => ({
        items: [
            ...stale.map((row) => refundAttention(row, PaymentAttentionKind.stale_refund)),
            ...refused.map((row) => refundAttention(row, PaymentAttentionKind.refused_refund)),
            ...manual.map((row) => refundAttention(row, PaymentAttentionKind.manual_refund_owed))
        ].toSorted((a, b) => a.since.localeCompare(b.since))
    }));
};
