/**
 * @module
 * The three reads behind the invoice and credit-note routes, each answering a caller rather than an
 * id: the order is read through the caller's own scope first, so a stranger's answer is the
 * order's own 404, and the credit-note rule (who may see them) sits here with the lookup it guards.
 * The controller keeps what only a request can do: the staff-read audit and the PDF bytes.
 */

import { holds } from '@kernel/ability';
import { callerForSubject } from '@kernel/permissions';
import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { isValidObjectId } from '@infrastructure/http/ids';
import { auditForbidden } from '@infrastructure/observability/forbidden';
import { isBuyer, orderService, type OrderDocument } from '@modules/orders';
import type { AuthContext, CallerContext } from '@types';
import { ERROR_CODES } from '@api/error-codes';
import type { CreditNoteDocument, InvoiceDocument } from '../model';
import { findInvoiceForOrder } from './issue-invoice';
import { findCreditNoteForOrderById, findCreditNotesForOrder } from './issue-credit-note';

/** A document read for a caller, with the order it belongs to (the staff-read audit names its buyer). */
export interface ReadFor<TDocument> {
    document: TDocument;
    order: OrderDocument;
}

/** The 404 for a credit note the caller may not see, or that does not exist. */
const creditNoteNotIssued = (): ResponseReject =>
    generateReject(404, [
        {
            code: ERROR_CODES.ORDER_CREDIT_NOTE_NOT_ISSUED,
            message: t('invoicing.credit-note-not-issued')
        }
    ]);

/**
 * Who may see an order's credit notes: the buyer, or staff who may also read the money. A credit
 * note carries the refund amount and the billing address, so being able to read the ORDER (the
 * warehouse packs everyone's) is not enough: the warehouse is refused the refund list for the same
 * reason (`display:Payment`). A refusal is audited as a forbidden attempt, since no route guard
 * sees it: the route serves buyers and staff alike.
 *
 * @param order - the order, already read through the caller's own scope
 * @param authContext - the caller
 * @param context - the caller, for the audit entry
 * @returns whether the caller may see the credit notes
 */
const mayReadCreditNotes = (
    order: OrderDocument,
    authContext: AuthContext | undefined,
    context: CallerContext
): boolean => {
    if (!authContext) return false;
    if (isBuyer(order, authContext)) return true;
    if (holds(callerForSubject(authContext, 'Payment'), 'display', 'Payment')) return true;

    auditForbidden(context, {
        targetType: 'order',
        targetId: String(order._id),
        metadata: { reason: 'missing_permission', permission: 'display:Payment' }
    });
    return false;
};

/**
 * The order's invoice, for a caller who may read the order.
 * @param orderId - the order
 * @param authContext - the caller
 * @returns the invoice and its order, or a 404: unknown or unreadable order, or no invoice yet
 */
export const invoiceForCaller = (
    orderId: string,
    authContext: AuthContext | undefined
): Promise<ResponseSuccess<ReadFor<InvoiceDocument>> | ResponseReject> =>
    orderService.getForCaller(orderId, authContext).then((order) => {
        if (!order) return generateReject(404, [t('orders.not-found')]);

        return findInvoiceForOrder(String(order._id)).then((invoice) =>
            invoice
                ? generateSuccess({ document: invoice, order })
                : generateReject(404, [
                      {
                          code: ERROR_CODES.ORDER_INVOICE_NOT_ISSUED,
                          message: t('invoicing.not-issued')
                      }
                  ])
        );
    });

/**
 * The order's credit notes, for a caller who may read the order. Staff who may read the order but
 * not the money see none, and are not told there are any.
 * @param orderId - the order
 * @param authContext - the caller
 * @param context - the caller, for the audit entry of a refusal
 * @returns the credit notes (empty when the caller may not see them), or a 404 for the order
 */
export const creditNotesForCaller = (
    orderId: string,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<CreditNoteDocument[]> | ResponseReject> =>
    orderService.getForCaller(orderId, authContext).then((order) => {
        if (!order) return generateReject(404, [t('orders.not-found')]);
        if (!mayReadCreditNotes(order, authContext, context)) return generateSuccess([]);

        return findCreditNotesForOrder(String(order._id)).then((notes) => generateSuccess(notes));
    });

/**
 * One credit note of the order, for a caller who may read both. An unknown or malformed credit
 * note answers "not issued" only to a caller who may see the order at all, and so does a caller
 * who may read the order but not the money.
 * @param orderId - the order
 * @param creditNoteId - the credit note; unchecked, since a malformed one must answer "not issued"
 * @param authContext - the caller
 * @param context - the caller, for the audit entry of a refusal
 * @returns the credit note and its order, or a 404
 */
export const creditNoteForCaller = (
    orderId: string,
    creditNoteId: string | undefined,
    authContext: AuthContext | undefined,
    context: CallerContext
): Promise<ResponseSuccess<ReadFor<CreditNoteDocument>> | ResponseReject> =>
    orderService.getForCaller(orderId, authContext).then((order) => {
        if (!order) return generateReject(404, [t('orders.not-found')]);
        if (!isValidObjectId(creditNoteId) || !mayReadCreditNotes(order, authContext, context))
            return creditNoteNotIssued();

        return findCreditNoteForOrderById(String(order._id), creditNoteId).then((creditNote) =>
            creditNote ? generateSuccess({ document: creditNote, order }) : creditNoteNotIssued()
        );
    });
