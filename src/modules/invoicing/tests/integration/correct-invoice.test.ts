/**
 * @module
 * Staff correcting the buyer on an invoiced order, end to end: `orders` writes the address and
 * announces it, `invoicing` cancels the live invoice with a credit note and issues a new one. Reached
 * through `orderService.correctBillingAddress` and the real `module.ts` subscription, never by
 * calling the listener's own function, so this also proves the event wiring. The one exception is
 * the redelivery test, which calls the listener's function twice with one event id.
 *
 * @see docs/modules/invoicing.md#correcting-the-buyer
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import usersModule from '@modules/users/module';
import productsModule from '@modules/products/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import invoicingModule from '@modules/invoicing/module';
import { markPaid } from '@modules/orders/friends/payments';
import { orderService } from '@modules/orders';
import { createProduct } from '@modules/products/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createOrder, timelineOf, toOrderItem } from '@modules/orders/tests/factories';
import { asSuccess } from '@tests/response';
import { callerContextAs } from '@tests/callers';
import { eventually } from '@tests/eventually';
import { creditNoteNumberCounterModel, invoiceNumberCounterModel } from '../../model';
import type { CreditNoteDocument, InvoiceDocument } from '../../model';
import { decryptInvoiceParty } from '../../pii';
import { invoicingRepository } from '../../repository';
import { invoicingService } from '../../services';
import { correctInvoice } from '../../services/correct-invoice';
import { collectPersonalData } from '../../services/personal-data';
import { issueCreditNote, waitForInvoice } from '../factories';

setupTestDb();

beforeEach(() => {
    registerModules([usersModule, productsModule, inventoryModule, ordersModule, invoicingModule]);
});

afterEach(() => resetDomainEvents());

/** What the order was invoiced to at checkout. */
const BEFORE = {
    fullName: 'Mario Rossi',
    street: 'Via Roma 1',
    city: 'Milano',
    zip: '20100',
    country: 'IT'
};

/** The company the buyer then asked for, with its VAT number. */
const AFTER = { ...BEFORE, fullName: 'Rossi Srl', vatNumber: 'IT01234567890' };

/** A paid, invoiced order of one 25.00 line, billed to {@link BEFORE}. */
const paidAndInvoiced = async () => {
    const user = await createUser();
    const product = await createProduct({ price: '25.00' });
    const order = await createOrder(user, [toOrderItem(product, 1)], { billingAddress: BEFORE });
    const orderId = String(order._id);
    await markPaid(orderId);
    return { orderId, userId: user.id, invoice: await waitForInvoice(orderId) };
};

/** Staff correcting the order's billing address, through the real door. */
const correct = (orderId: string, address: typeof AFTER | typeof BEFORE = AFTER) =>
    orderService.correctBillingAddress(orderId, address, callerContextAs('admin'));

/** The order's credit notes, once it has `count` of them. */
const waitForNotes = async (orderId: string, count: number): Promise<CreditNoteDocument[]> => {
    await eventually(() =>
        invoicingRepository.findCreditNotesByOrderId(orderId).then((notes) => notes.length >= count)
    );
    return invoicingRepository.findCreditNotesByOrderId(orderId);
};

/** The buyer block of an invoice, decrypted. */
const buyerOf = (invoice: InvoiceDocument) =>
    decryptInvoiceParty(invoice.billingAddress!, 'invoice', invoice._id);

/** Both numbering counters' running sequence. */
const counters = () =>
    Promise.all([
        invoiceNumberCounterModel.findOne().lean(),
        creditNoteNumberCounterModel.findOne().lean()
    ]).then(([invoices, creditNotes]) => ({
        invoices: invoices?.seq,
        creditNotes: creditNotes?.seq
    }));

describe('correcting the buyer of an invoiced order', () => {
    it("exports the cancelled invoice, the credit note and the reissued invoice in the buyer's data export", async () => {
        const { orderId, userId, invoice } = await paidAndInvoiced();
        await correct(orderId);
        const [note] = await waitForNotes(orderId, 1);
        await settleOutboxNudges();
        const [, current] = await invoicingRepository.findInvoicesByOrderId(orderId);

        const exported = await collectPersonalData(userId);

        // Every invoice was issued to this buyer, the corrected one included.
        expect(exported.invoices.map(({ number }) => number).toSorted()).toEqual(
            [invoice.number, current.number].toSorted()
        );
        expect(exported.creditNotes).toEqual([
            expect.objectContaining({ orderId, number: note.number, grandTotal: '25.00' })
        ]);
    });

    it('cancels the invoice with a refund-less credit note and reissues it to the corrected buyer', async () => {
        const { orderId, invoice } = await paidAndInvoiced();

        await correct(orderId);
        const [note] = await waitForNotes(orderId, 1);
        await settleOutboxNudges();

        expect(note.reason).toBe('correction');
        expect(note.refundId).toBeUndefined();
        expect(String(note.invoiceId)).toBe(String(invoice._id));
        expect(note.grandTotal).toBe('25.00');
        const live = await invoicingService.findInvoiceForOrder(orderId);
        expect(String(live?._id)).not.toBe(String(invoice._id));
        expect(live?.grandTotal).toBe('25.00');
        expect(buyerOf(live!)).toMatchObject({ fullName: 'Rossi Srl', vatNumber: 'IT01234567890' });
        const [old, current] = await invoicingRepository.findInvoicesByOrderId(orderId);
        expect(old.status).toBe('corrected');
        expect(current.status).toBe('issued');
        // The credit note reproduces what it cancels: the OLD buyer.
        expect(decryptInvoiceParty(note.billingAddress!, 'credit-note', note._id).fullName).toBe(
            'Mario Rossi'
        );
        const timeline = await timelineOf(orderId);
        const types = timeline.map((entry) => entry.type);
        expect(types).toEqual(expect.arrayContaining(['billing_corrected', 'invoice_corrected']));
    });

    it('credits only what is still invoiced after a partial refund, and says where the remainder comes from', async () => {
        const { orderId, invoice } = await paidAndInvoiced();
        const refund = await issueCreditNote({
            orderId,
            refundId: 'refund-1',
            amount: '5.00',
            full: false
        });

        await correct(orderId);
        const notes = await waitForNotes(orderId, 2);
        const correction = notes.find((note) => note.reason === 'correction')!;
        await settleOutboxNudges();

        expect(correction.grandTotal).toBe('20.00');
        const live = await invoicingService.findInvoiceForOrder(orderId);
        expect(live?.grandTotal).toBe('20.00');
        // Art. 226(6): the line names the invoice and the credit notes it is the remainder of.
        expect(live?.lines[0].title).toContain(invoice.number);
        expect(live?.lines[0].title).toContain(refund!.number);
    });

    it('credits a later refund against the live invoice', async () => {
        const { orderId } = await paidAndInvoiced();
        await correct(orderId);
        await waitForNotes(orderId, 1);
        await settleOutboxNudges();
        const live = await invoicingService.findInvoiceForOrder(orderId);

        const note = await issueCreditNote({
            orderId,
            refundId: 'refund-after',
            amount: '25.00',
            full: true
        });

        expect(String(note?.invoiceId)).toBe(String(live?._id));
        expect(note?.reason).toBe('refund');
    });

    it('issues nothing for an order with no invoice yet, and the future invoice carries the corrected buyer', async () => {
        const user = await createUser();
        const product = await createProduct({ price: '25.00' });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            billingAddress: BEFORE
        });
        const orderId = String(order._id);

        await correct(orderId);
        await settleOutboxNudges();
        expect(await invoicingRepository.findInvoicesByOrderId(orderId)).toHaveLength(0);

        await markPaid(orderId);
        const invoice = await waitForInvoice(orderId);

        expect(buyerOf(invoice)).toMatchObject({
            fullName: 'Rossi Srl',
            vatNumber: 'IT01234567890'
        });
        expect(await invoicingRepository.findCreditNotesByOrderId(orderId)).toHaveLength(0);
    });

    it('cancels and reissues once per correction, leaving only the last invoice live', async () => {
        const { orderId } = await paidAndInvoiced();

        await correct(orderId);
        await waitForNotes(orderId, 1);
        await settleOutboxNudges();
        await correct(orderId, { ...AFTER, fullName: 'Rossi Holding Srl' });
        const notes = await waitForNotes(orderId, 2);
        await settleOutboxNudges();

        expect(notes.map((note) => note.reason)).toEqual(['correction', 'correction']);
        const invoices = await invoicingRepository.findInvoicesByOrderId(orderId);
        expect(invoices.map((invoice) => invoice.status)).toEqual([
            'corrected',
            'corrected',
            'issued'
        ]);
        expect(buyerOf(invoices[2]).fullName).toBe('Rossi Holding Srl');
    });

    it('survives a repeated paid event: the live invoice is returned, none is added', async () => {
        const { orderId } = await paidAndInvoiced();
        await correct(orderId);
        await waitForNotes(orderId, 1);
        await settleOutboxNudges();
        const live = await invoicingService.findInvoiceForOrder(orderId);
        const order = await orderService.getById(orderId);

        const again = await invoicingService.issueInvoice(order!);

        expect(String(again?._id)).toBe(String(live?._id));
        expect(await invoicingRepository.findInvoicesByOrderId(orderId)).toHaveLength(2);
    });

    it('issues nothing and burns no number when the same correction event is delivered again', async () => {
        const { orderId } = await paidAndInvoiced();
        await orderService.correctBillingAddress(orderId, AFTER, callerContextAs('admin'));
        await settleOutboxNudges();
        const [first] = await waitForNotes(orderId, 1);
        const before = await counters();

        // The key is the outbox row's own id, not something the listener makes up: a random one would never repeat.
        const row = await outboxEventModel.findOne({ name: 'order.billing_corrected' }).lean();
        expect(first.correctionKey).toBe(String(row?._id));

        const again = await correctInvoice(orderId, String(first.correctionKey));

        expect(String(again?._id)).toBe(String(first._id));
        expect(await invoicingRepository.findCreditNotesByOrderId(orderId)).toHaveLength(1);
        expect(await invoicingRepository.findInvoicesByOrderId(orderId)).toHaveLength(2);
        expect(await counters()).toEqual(before);
    });

    it('lets one of two corrections racing on one invoice through and turns the other away', async () => {
        const { orderId } = await paidAndInvoiced();

        const outcomes = await Promise.allSettled([
            correctInvoice(orderId, 'event-a'),
            correctInvoice(orderId, 'event-b')
        ]);

        // The loser is retried against the cancelled invoice and throws, so the outbox runs it again.
        expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
        const notes = await invoicingRepository.findCreditNotesByOrderId(orderId);
        expect(notes.filter((note) => note.reason === 'correction')).toHaveLength(1);
        expect(await invoicingRepository.findInvoicesByOrderId(orderId)).toHaveLength(2);
    });

    it('credits the refund that settled while the correction was running, so the same money is never credited twice', async () => {
        const { orderId } = await paidAndInvoiced();
        const real = invoicingRepository.findCreditNotesByInvoiceId;
        let raced = false;
        // The correction reads what is credited, THEN a refund settles; the correction's write conflicts and runs again.
        const spy = jest
            .spyOn(invoicingRepository, 'findCreditNotesByInvoiceId')
            .mockImplementation(async (invoiceId, session) => {
                const notes = await real(invoiceId, session);
                if (!raced) {
                    raced = true;
                    await issueCreditNote({
                        orderId,
                        refundId: 'refund-race',
                        amount: '5.00',
                        full: false
                    });
                }
                return notes;
            });

        await correctInvoice(orderId, 'event-race');
        spy.mockRestore();

        const notes = await invoicingRepository.findCreditNotesByOrderId(orderId);
        const correction = notes.find((note) => note.reason === 'correction');
        expect(notes).toHaveLength(2);
        expect(correction?.grandTotal).toBe('20.00');
        const live = await invoicingService.findInvoiceForOrder(orderId);
        expect(live?.grandTotal).toBe('20.00');
    });

    it('turns a refund away from an invoice a correction cancelled meanwhile, so the outbox retries it against the new one', async () => {
        const { orderId } = await paidAndInvoiced();
        const stale = await invoicingService.findInvoiceForOrder(orderId);
        await correct(orderId);
        await waitForNotes(orderId, 1);
        await settleOutboxNudges();
        // The refund's first read, before its transaction, still shows the cancelled invoice.
        const spy = jest
            .spyOn(invoicingRepository, 'findInvoiceByOrderId')
            .mockResolvedValueOnce(stale);

        await expect(
            issueCreditNote({ orderId, refundId: 'refund-late', amount: '5.00', full: false })
        ).rejects.toThrow('no longer the live invoice');
        spy.mockRestore();

        const notes = await invoicingRepository.findCreditNotesByOrderId(orderId);
        expect(notes.map((note) => note.reason)).toEqual(['correction']);
        // The retry, as the outbox runs it, credits the live invoice.
        const retried = await issueCreditNote({
            orderId,
            refundId: 'refund-late',
            amount: '5.00',
            full: false
        });
        const live = await invoicingService.findInvoiceForOrder(orderId);
        expect(String(retried?.invoiceId)).toBe(String(live?._id));
    });

    it('does nothing for a repeat of the same correction: no second credit note, no number burned', async () => {
        const { orderId } = await paidAndInvoiced();
        await correct(orderId);
        await waitForNotes(orderId, 1);
        await settleOutboxNudges();
        const before = await counters();

        await correct(orderId);
        await settleOutboxNudges();

        expect(await invoicingRepository.findCreditNotesByOrderId(orderId)).toHaveLength(1);
        expect(await invoicingRepository.findInvoicesByOrderId(orderId)).toHaveLength(2);
        expect(await counters()).toEqual(before);
    });

    it('issues nothing when the invoice is already fully credited, though the address still changes', async () => {
        const { orderId } = await paidAndInvoiced();
        await issueCreditNote({ orderId, refundId: 'refund-all', amount: '25.00', full: true });

        await correct(orderId);
        await settleOutboxNudges();

        const notes = await invoicingRepository.findCreditNotesByOrderId(orderId);
        expect(notes.map((note) => note.reason)).toEqual(['refund']);
        expect(await invoicingRepository.findInvoicesByOrderId(orderId)).toHaveLength(1);
        const order = await orderService.getById(orderId);
        expect(orderService.billingAddressOf(order!)).toMatchObject({ fullName: 'Rossi Srl' });
    });

    it('gives a walk-in order that had no billing address one, and prints it on the reissue', async () => {
        const product = await createProduct({ price: '10.00' });
        const placed = await orderService.create(
            undefined,
            'counter@example.com',
            [{ productId: String(product._id), quantity: 1 }],
            callerContextAs('admin')
        );
        const orderId = String(asSuccess(placed).data._id);
        await markPaid(orderId);
        const invoice = await waitForInvoice(orderId);
        expect(invoice.billingAddress).toBeUndefined();

        await correct(orderId);
        const [note] = await waitForNotes(orderId, 1);
        await settleOutboxNudges();

        expect(note.billingAddress).toBeUndefined();
        const live = await invoicingService.findInvoiceForOrder(orderId);
        expect(buyerOf(live!)).toMatchObject({ fullName: 'Rossi Srl' });
    });
});
