/**
 * @module
 * Invoicing test helpers — the invoice a fire-and-forget `ORDER_STATUS_CHANGED` listener freezes,
 * waited for through its own door.
 */

import { eventually } from '@tests/eventually';

/**
 * Freeze a credit note from the amounts given, for a sibling's test of what reads one. Not on
 * `invoicingService`: only this module's own `payment.refunded` listener runs it in production.
 */
export { issueCreditNote } from '../services/issue-credit-note';
import { invoicingRepository } from '../repository';

/**
 * Waits for the invoice of `orderId` to be frozen, then returns it.
 *
 * @param orderId - the order that reached paid
 * @throws {Error} when no invoice was frozen within the polling window
 */
export const waitForInvoice = async (orderId: string) => {
    await eventually(() => invoicingRepository.findInvoiceByOrderId(orderId).then(Boolean));
    const invoice = await invoicingRepository.findInvoiceByOrderId(orderId);
    if (!invoice) throw new Error('the invoice was never frozen');
    return invoice;
};
