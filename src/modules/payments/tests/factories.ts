/**
 * @module
 * Payments test factories — paying an order by card, and a bank-transfer order as the checkout
 * leaves it, with its transfer payment opened through the module's own door (`order.created`'s listener), so a test that needs
 * "an order waiting for a transfer" gets the reference, the deadline and the `requires_action` row a
 * real one has. Writes past nothing: the helper is the listener, called once.
 */

import { Types } from 'mongoose';
import { asCustomer, testCallerContext } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import type { UserDocument } from '@modules/users';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import type { OrderDocument } from '@modules/orders';
import { buildReference } from '../domain';
import { paymentService } from '../services';
import { paymentRepository } from '../repository';
import type { PaymentDocument } from '../model';

/**
 * The cancel listener's refund, for a sibling's test that needs a refunded order. Not on
 * `paymentService`: only this module's own `order.cancelled` listener runs it in production.
 */
export { refundForOrder } from '../services/refunds';

/** What a test may pin on {@link transferOrder}. */
export interface TransferOrderOptions {
    /** The buyer; a fresh customer by default. */
    user?: UserDocument;
    /** Unit price of the single line; 20 by default. */
    price?: number;
    /** Hours until the stock hold ends; 168 (a week) by default. */
    holdHours?: number;
}

/**
 * A pending `bank_transfer` order with its transfer payment opened.
 *
 * @param options - the buyer, the price, the hold
 * @returns the order, its payment and the RF reference both carry
 */
export const transferOrder = async (
    options: TransferOrderOptions = {}
): Promise<{ order: OrderDocument; payment: PaymentDocument; reference: string }> => {
    const user = options.user ?? (await createUser());
    const product = await createProduct({ price: options.price ?? 20 });
    const id = new Types.ObjectId();
    const order = await createOrder(user, [toOrderItem(product, 1)], {
        id: id.toHexString(),
        paymentMethod: 'bank_transfer',
        payBy: new Date(Date.now() + (options.holdHours ?? 168) * 3_600_000).toISOString()
    });
    await paymentService.openTransferPayment(id.toHexString());
    const payment = await paymentRepository.findByOrderId(id.toHexString());
    if (!payment) throw new Error('the transfer payment did not open');
    return { order, payment, reference: buildReference(id.toHexString()) };
};

/**
 * Pays `order` by card through the fake provider: the buyer opens an intent, then confirms it with
 * the provider's always-approved test card. Delivery of the settlement's events is after the
 * response — a test that moves the order on settles the outbox itself.
 *
 * @param order - the order to pay
 * @param user - the buyer
 * @throws {Error} when the intent is refused
 */
export const payByCard = async (order: OrderDocument, user: UserDocument): Promise<void> => {
    const buyer = asCustomer(user.id);
    const intent = await paymentService.createIntent(String(order._id), buyer);
    if (!intent.success) throw new Error('intent refused');

    await paymentService.confirmPayment(intent.data.id, 'pm_card_visa', buyer, testCallerContext);
};
