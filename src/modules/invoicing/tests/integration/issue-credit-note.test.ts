/**
 * @module
 * Credit-note issuance, end to end: a `succeeded` payment moving to `refunded` is the ONLY thing
 * that ever freezes a credit note — reached here through `payments`' real `performRefund` and the
 * real `module.ts` subscription to `PAYMENT_REFUNDED`, never by calling `issueCreditNote` directly.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import usersModule from '@modules/users/module';
import productsModule from '@modules/products/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import paymentsModule from '@modules/payments/module';
import invoicingModule from '@modules/invoicing/module';
import { createIntent, confirmPayment, performRefund } from '@modules/payments';
import { createProduct } from '@modules/products/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { asCustomer, testCallerContext } from '@tests/callers';
import { invoicingRepository } from '../../repository';

/** `payments/providers/fake.ts`'s own "always succeeds" reference — the demo panel's default. */
const FAKE_SUCCESS_METHOD = 'pm_card_visa';

setupTestDb();

beforeEach(() => {
    registerModules([
        usersModule,
        productsModule,
        inventoryModule,
        ordersModule,
        paymentsModule,
        invoicingModule
    ]);
});

afterEach(() => resetDomainEvents());

/** Polls a fire-and-forget listener's own write until it lands, or gives up. */
const waitUntil = async <T>(read: () => Promise<T | null>, timeoutMs = 2000): Promise<T> => {
    const startedAt = Date.now();
    for (;;) {
        const value = await read();
        if (value) return value;
        if (Date.now() - startedAt > timeoutMs) throw new Error('waitUntil: timed out');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

describe('issuing a credit note off PAYMENT_REFUNDED', () => {
    it('freezes a credit note, numbered in its own series, once the refund lands', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 25 });
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const intent = await createIntent(String(order._id), asCustomer(user.id));
        if (!intent.success) throw new Error('intent refused');
        await confirmPayment(
            intent.data.id,
            FAKE_SUCCESS_METHOD,
            asCustomer(user.id),
            testCallerContext
        );
        const invoice = await waitUntil(() =>
            invoicingRepository.findInvoiceByOrderId(String(order._id))
        );

        await performRefund(String(order._id));
        const creditNote = await waitUntil(() =>
            invoicingRepository.findCreditNoteByOrderId(String(order._id))
        );

        // Both series independently start their own year at 1 — the SAME printed number on two
        // different documents is expected, not a collision; only `invoiceId`/`invoiceNumber`
        // below prove the two rows are actually linked.
        expect(creditNote.number).toMatch(/^\d{4}-\d{6}$/);
        expect(creditNote.invoiceId.toString()).toBe(invoice._id.toString());
        expect(creditNote.invoiceNumber).toBe(invoice.number);
        expect(creditNote.grandTotal).toBe(invoice.grandTotal);
    });

    it('issues nothing when there is no invoice to reverse', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 25 });
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        // No payment was ever taken on this order — `performRefund` finds nothing `succeeded`
        // and never fires `PAYMENT_REFUNDED`, so there is nothing for a credit note to correct.
        await performRefund(String(order._id));
        await new Promise((resolve) => setTimeout(resolve, 50));

        await expect(
            invoicingRepository.findCreditNoteByOrderId(String(order._id))
        ).resolves.toBeNull();
    });
});
