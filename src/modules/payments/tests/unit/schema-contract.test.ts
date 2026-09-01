/**
 * @module
 * The payment schema's contract. One declaration here is the module's whole idempotence story:
 * `unique: true` on `orderId` — an order has at most one payment, enforced by the database, so a
 * retried intent (double-clicked checkout, replayed webhook) fails its insert instead of creating
 * a second payment. Remove it and nothing throws; the shop simply becomes able to charge twice.
 */

import { paymentSchema } from '@modules/payments/model';
import { PaymentStatus } from '@types';
import {
    defaultOf,
    enumOf,
    indexOptionSpecs,
    optionsOf,
    pathOptions,
    refOf,
    requiredPaths,
    typeOf
} from '@tests/schema';

describe('paymentSchema', () => {
    it('requires everything needed to say what was paid, for which order', () => {
        // `cardLast4` is absent: not every provider has a card, and the fake one has no digits to
        // report. `status` carries a default instead, which is why it is not required either.
        // `userId` is deliberately absent too — account erasure unsets it, the same treatment
        // as `orders`'.
        expect(requiredPaths(paymentSchema)).toEqual(['amount', 'currency', 'orderId', 'provider']);
    });

    it('allows at most one payment per order, in the database', () => {
        expect(indexOptionSpecs(paymentSchema)).toContain('orderId_1: unique=true');
    });

    it('points at the order and the payer as real ObjectId references', () => {
        expect(typeOf(paymentSchema, 'orderId')).toBe('ObjectId');
        expect(refOf(paymentSchema, 'orderId')).toBe('Order');
        expect(typeOf(paymentSchema, 'userId')).toBe('ObjectId');
        expect(refOf(paymentSchema, 'userId')).toBe('User');
    });

    it('refuses a negative amount', () => {
        // A negative charge is a refund issued through the wrong door — one that no refund path
        // audits, reconciles or reports.
        expect(pathOptions(paymentSchema, 'amount').min).toBe(0);
    });

    it('restricts status to the contract enum and starts unconfirmed', () => {
        // The default is the safe end: a freshly created payment has taken no money. Defaulting
        // to anything else would mark an unpaid order paid the moment its intent was created.
        expect(enumOf(paymentSchema, 'status')).toEqual(Object.values(PaymentStatus));
        expect(defaultOf(paymentSchema, 'status')).toBe(PaymentStatus.requires_confirmation);
    });

    it('keeps timestamps', () => {
        expect(optionsOf(paymentSchema).timestamps).toBe(true);
    });
});
