/**
 * @module
 * Payments test factories — a bank-transfer order as the checkout leaves it, with its transfer
 * payment opened through the module's own door (`order.created`'s listener), so a test that needs
 * "an order waiting for a transfer" gets the reference, the deadline and the `requires_action` row a
 * real one has. Writes past nothing: the helper is the listener, called once.
 */

import { Types } from 'mongoose';
import { createUser } from '@modules/users/tests/factories';
import type { UserDocument } from '@modules/users';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import type { OrderDocument } from '@modules/orders';
import { buildReference } from '../domain';
import { openTransferPayment } from '../services';
import { paymentRepository } from '../repository';
import type { PaymentDocument } from '../model';

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
    await openTransferPayment(id.toHexString());
    const payment = await paymentRepository.findByOrderId(id.toHexString());
    if (!payment) throw new Error('the transfer payment did not open');
    return { order, payment, reference: buildReference(id.toHexString()) };
};
