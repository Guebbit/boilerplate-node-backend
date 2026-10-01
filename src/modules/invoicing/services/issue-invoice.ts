/**
 * @module
 * Freezing an order into its invoice — the one write this module makes off `ORDER_STATUS_CHANGED`
 * (`to: 'paid'`), through `module.ts`'s own listener. Idempotent by construction: a redelivered
 * event, or two settlements racing the same order (see `orders/services/status.ts#markPaid`'s own
 * docblock), both attempt this, and `repository.ts#insertInvoice` reads the loser's duplicate-key
 * error back into the row the winner already wrote, rather than doubling the document.
 *
 * See: docs/modules/invoicing.md
 */

import { orderTaxBreakdown, orderTotal, orderCurrency, shopIdentity } from '@modules/orders';
import type { OrderDocument } from '@modules/orders';
import { invoicingRepository } from '../repository';
import { allocateInvoiceNumber } from './numbering';
import type { InvoiceDocument, InvoiceLine, InvoiceSeller } from '../model';

/**
 * The seller's own identity, frozen fresh at every issue — never re-read once an invoice exists.
 * Everything but the VAT number is required at boot, so only that one can be absent.
 */
const frozenSeller = (): InvoiceSeller => {
    const { legalName, vatNumber, street, city, zip, country } = shopIdentity();
    return { legalName, ...(vatNumber ? { vatNumber } : {}), street, city, zip, country };
};

/**
 * One order line, frozen onto the invoice — title, quantity, the frozen unit price, VAT rate and
 * rate type. The net/tax/gross split is NOT stored per line: `emails.ts#buildVatBlock` re-derives
 * it from these same fields via `orderTaxBreakdown`, the pure function this module reuses rather
 * than re-implementing — storing the derived figures too would only be a second place for them to
 * drift from what that function computes. `rateType` is copied only when the order line actually
 * carries one — an order placed before this field existed has none to copy.
 */
const frozenLines = (order: OrderDocument): InvoiceLine[] =>
    order.items.map((item) => ({
        title: item.product.title,
        quantity: item.quantity,
        unitPrice: item.product.price,
        taxRate: item.product.taxRate,
        ...(item.product.rateType === undefined ? {} : { rateType: item.product.rateType })
    }));

/**
 * Freezes and numbers one order's invoice — the whole job `module.ts`'s `ORDER_STATUS_CHANGED`
 * listener delegates here. Reads the order's OWN frozen `shippingAddress` as the Art. 226 billing
 * address: this shop collects no separate billing address, and the ship-to address is the only
 * customer address a checkout ever records. The render locale is the order's own frozen locale
 * (`items[0].locale`) — the language its product titles were resolved into at checkout — same
 * reasoning the old receipt render followed.
 *
 * @param order - the order that just moved to `paid`, as `orderService.getById` hands it back
 * @returns the invoice for this order — freshly issued, or the one that already existed when a
 *   racing writer got here first; `undefined` only for an order with no lines to invoice at all
 */
export const issueInvoice = (order: OrderDocument): Promise<InvoiceDocument | undefined> => {
    if (order.items.length === 0) return Promise.resolve(undefined);

    const currency = orderCurrency(order);
    const breakdown = orderTaxBreakdown({
        items: order.items,
        shippingCost: order.shippingCost,
        currency
    });

    return allocateInvoiceNumber().then((number) =>
        invoicingRepository.insertInvoice({
            orderId: order._id,
            number,
            issuedAt: new Date(),
            currency,
            locale: order.items[0].locale,
            ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
            ...(order.shippingAddress ? { billingAddress: order.shippingAddress } : {}),
            seller: frozenSeller(),
            lines: frozenLines(order),
            ...(order.shippingCost === undefined ? {} : { shippingCost: order.shippingCost }),
            netTotal: breakdown.netTotal,
            taxTotal: breakdown.taxTotal,
            shippingNetAmount: breakdown.shippingNetAmount,
            shippingTaxAmount: breakdown.shippingTaxAmount,
            taxSummary: breakdown.taxSummary,
            shippingByRate: breakdown.shippingByRate,
            // The exact function `orders/model.ts#applyOrderTotals` and the placed-order email
            // both quote — never a hand-composed sum, so this can never drift from what the order
            // itself says it charged.
            grandTotal: orderTotal({
                items: order.items,
                shippingCost: order.shippingCost,
                currency
            })
        })
    );
};

/**
 * The invoice for one order, or `null` if it has none yet — `GET /orders/{id}/invoice`'s own
 * existence check, and `services/issue-credit-note.ts`'s read of what a credit note corrects. The
 * service's own door onto {@link invoicingRepository}'s read, so neither caller reaches the
 * repository directly.
 * @param orderId - the order to look up
 */
export const findInvoiceForOrder = (orderId: string): Promise<InvoiceDocument | null> =>
    invoicingRepository.findInvoiceByOrderId(orderId);
