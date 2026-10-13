/**
 * @module
 * The staff reads behind the Payments page: the list, the refunds across every payment, and what
 * needs a person. All three are `payments.any.read` routes, so every row carries the provider ids.
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
import type { PaginatedMeta } from '@infrastructure/persistence/search';
import { orderService } from '@modules/orders';
import { paymentAttentionMinutes } from '../config';
import { displayStatusFilter } from '../domain';
import type { PaymentDocument } from '../model';
import { presentPayment } from '../presenter';
import { paymentRepository, type RefundFilters, type RefundRow } from '../repository';
import { callerScope } from './scope';

/** Most rows one needs-attention source contributes. */
const ATTENTION_LIMIT = 100;

/**
 * One stored payment as a staff list row.
 *
 * @param payment - the stored row
 * @param order - its order's number and email, when `orders` knows it
 */
const staffRow = (
    payment: PaymentDocument,
    order: { orderNumber: string; email: string } | undefined
): Payment => ({
    ...presentPayment(payment, true),
    ...(order ? { orderNumber: order.orderNumber, email: order.email } : {})
});

/**
 * One page of payments, filtered and sorted, with each row's order number and email.
 *
 * @param filters - the validated search
 * @param authContext - the caller (already known to hold `payments.any.read`)
 */
export const listPayments = (
    filters: SearchPaymentsRequest,
    authContext?: AuthContext
): Promise<{ items: Payment[]; meta: PaginatedMeta }> =>
    paymentRepository
        .searchStaff(
            filters,
            filters.displayStatus ? displayStatusFilter(filters.displayStatus) : undefined,
            callerScope(authContext)
        )
        .then(({ items, meta }) =>
            orderService.findManyByIds(items.map((item) => String(item.orderId))).then((orders) => {
                const byId = new Map(orders.map((order) => [order.id, order]));
                return {
                    items: items.map((item) => staffRow(item, byId.get(String(item.orderId)))),
                    meta
                };
            })
        );

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
    since: row.refund.createdAt.toISOString()
});

/**
 * Every problem still recorded on a document, oldest first: refunds open past the threshold,
 * refunds owed by hand, orders owing their refund. A fixed problem has cleared its marker, so it
 * is not here.
 */
export const listAttention = (): Promise<{ items: PaymentAttentionItem[] }> => {
    const cutoff = new Date(Date.now() - paymentAttentionMinutes() * 60_000);
    return Promise.all([
        paymentRepository.findOpenRefundRows({
            manual: false,
            openBefore: cutoff,
            limit: ATTENTION_LIMIT
        }),
        paymentRepository.findOpenRefundRows({ manual: true, limit: ATTENTION_LIMIT }),
        orderService.findOwedRefunds(cutoff, ATTENTION_LIMIT)
    ]).then(([stale, manual, owed]) => ({
        items: [
            ...stale.map((row) => refundAttention(row, PaymentAttentionKind.stale_refund)),
            ...manual.map((row) => refundAttention(row, PaymentAttentionKind.manual_refund_owed)),
            ...owed.map(
                ({ orderId, since }): PaymentAttentionItem => ({
                    kind: PaymentAttentionKind.order_refund_owed,
                    orderId,
                    since: since.toISOString()
                })
            )
        ].toSorted((a, b) => a.since.localeCompare(b.since))
    }));
};
