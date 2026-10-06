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
import { createIntent, confirmPayment, performRefund, paymentService } from '@modules/payments';
import { createProduct } from '@modules/products/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { asCustomer, asAdmin, testCallerContext, callerContextAs } from '@tests/callers';
import { creditNoteNumberCounterModel } from '../../model';
import { invoicingRepository } from '../../repository';
import { issueCreditNote } from '../../services';

/** The fake PSP's "always succeeds" reference (`scenarios/support/doubles/payments/fake.ts`). */
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

/** A customer who paid 25.00 and whose invoice has been frozen. */
const paidAndInvoiced = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 25 });
    const order = await createOrder(user, [toOrderItem(product, 1)]);
    const orderId = String(order._id);
    const intent = await createIntent(orderId, asCustomer(user.id));
    if (!intent.success) throw new Error('intent refused');
    await confirmPayment(
        intent.data.id,
        FAKE_SUCCESS_METHOD,
        asCustomer(user.id),
        testCallerContext
    );
    const invoice = await waitUntil(() => invoicingRepository.findInvoiceByOrderId(orderId));
    return { orderId, invoice };
};

/** Polls until the order has `count` credit notes. */
const waitForNotes = (orderId: string, count: number) =>
    waitUntil(() =>
        invoicingRepository
            .findCreditNotesByOrderId(orderId)
            .then((notes) => (notes.length >= count ? notes : null))
    );

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
        const [creditNote] = await waitUntil(() =>
            invoicingRepository
                .findCreditNotesByOrderId(String(order._id))
                .then((notes) => (notes.length > 0 ? notes : null))
        );

        // Both series independently start their own year at 1 — the SAME printed number on two
        // different documents is expected, not a collision; only `invoiceId`/`invoiceNumber`
        // below prove the two rows are actually linked.
        expect(creditNote.number).toMatch(/^\d{4}-\d{6}$/);
        expect(creditNote.invoiceId.toString()).toBe(invoice._id.toString());
        expect(creditNote.invoiceNumber).toBe(invoice.number);
        expect(creditNote.grandTotal).toBe(invoice.grandTotal);
    });

    it('mirrors the invoice for a full refund', async () => {
        const { orderId, invoice } = await paidAndInvoiced();

        await paymentService.refundByOrder(orderId, asAdmin(), callerContextAs('admin'));
        const notes = await waitForNotes(orderId, 1);

        expect(notes[0].lines).toHaveLength(invoice.lines.length);
        expect(notes[0].grandTotal).toBe(invoice.grandTotal);
        expect(notes[0].netTotal).toBe(invoice.netTotal);
        expect(notes[0].taxTotal).toBe(invoice.taxTotal);
    });

    it('issues one credit note per partial refund, each for its own amount', async () => {
        const { orderId, invoice } = await paidAndInvoiced();

        await paymentService.refundByOrder(orderId, asAdmin(), callerContextAs('admin'), {
            amount: 20
        });
        await paymentService.refundByOrder(orderId, asAdmin(), callerContextAs('admin'), {
            amount: 5
        });
        const notes = await waitForNotes(orderId, 2);

        expect(notes.map((note) => note.grandTotal)).toEqual([20, 5]);
        expect(notes[0].number).not.toBe(notes[1].number);
        expect(notes[0].refundId).not.toBe(notes[1].refundId);
        for (const note of notes) {
            expect(note.invoiceNumber).toBe(invoice.number);
            // Reconciled: net + VAT is the credit note's own gross, to the cent.
            expect(Math.round((note.netTotal + note.taxTotal) * 100)).toBe(
                Math.round(note.grandTotal * 100)
            );
        }
    });

    it('is idempotent on the refund — a redelivered event issues nothing twice', async () => {
        const { orderId } = await paidAndInvoiced();
        await paymentService.refundByOrder(orderId, asAdmin(), callerContextAs('admin'), {
            amount: 20
        });
        const [note] = await waitForNotes(orderId, 1);

        const again = await issueCreditNote({
            orderId,
            refundId: note.refundId,
            amount: 20,
            full: false
        });

        expect(String(again?._id)).toBe(String(note._id));
        expect(await invoicingRepository.findCreditNotesByOrderId(orderId)).toHaveLength(1);
    });

    it('burns no number when two writers race to credit one refund', async () => {
        const { orderId } = await paidAndInvoiced();
        const year = new Date().getUTCFullYear();
        const input = { orderId, refundId: 'refund-race', amount: 5, full: false };

        const [first, second] = await Promise.all([issueCreditNote(input), issueCreditNote(input)]);

        // One document, one number: the loser's allocation rolled back with its aborted insert.
        expect(String(first?._id)).toBe(String(second?._id));
        const notes = await invoicingRepository.findCreditNotesByOrderId(orderId);
        expect(notes.filter((note) => note.refundId === 'refund-race')).toHaveLength(1);
        const counter = await creditNoteNumberCounterModel.findById(year).lean().exec();
        expect(counter?.seq).toBe(notes.length);
    });

    it('gives the number back when the insert fails for any other reason', async () => {
        const { orderId } = await paidAndInvoiced();
        const year = new Date().getUTCFullYear();
        const insert = jest
            .spyOn(invoicingRepository, 'insertCreditNote')
            .mockRejectedValueOnce(new Error('disk full'));

        await expect(
            issueCreditNote({ orderId, refundId: 'refund-fail', amount: 5, full: false })
        ).rejects.toThrow('disk full');
        insert.mockRestore();

        expect(await creditNoteNumberCounterModel.findById(year).lean().exec()).toBeNull();
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
            invoicingRepository.findCreditNotesByOrderId(String(order._id))
        ).resolves.toEqual([]);
    });
});
