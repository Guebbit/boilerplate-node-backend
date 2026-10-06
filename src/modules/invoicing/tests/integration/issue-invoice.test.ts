/**
 * @module
 * Invoice issuance, end to end: an order's `pending → paid` transition is the ONLY thing that ever
 * freezes an invoice — reached here through `orders`' own `markPaid` and the real `module.ts`
 * subscription, never by calling `issueInvoice` directly, so this also proves the event wiring.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { OrderStatus } from '@types';
import usersModule from '@modules/users/module';
import productsModule from '@modules/products/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import invoicingModule from '@modules/invoicing/module';
import { markPaid } from '@modules/orders';
import { createProduct } from '@modules/products/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { invoiceNumberCounterModel } from '../../model';
import { decryptInvoiceParty } from '../../pii';
import { invoicingRepository } from '../../repository';
import { issueInvoice } from '../../services';

setupTestDb();

beforeEach(() => {
    registerModules([usersModule, productsModule, inventoryModule, ordersModule, invoicingModule]);
});

afterEach(() => resetDomainEvents());

/** Waits out the fire-and-forget `ORDER_STATUS_CHANGED` listener that freezes the invoice. */
const waitForInvoice = async (orderId: string, timeoutMs = 2000) => {
    const startedAt = Date.now();
    for (;;) {
        const invoice = await invoicingRepository.findInvoiceByOrderId(orderId);
        if (invoice) return invoice;
        if (Date.now() - startedAt > timeoutMs) throw new Error('waitForInvoice: timed out');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

describe('issuing an invoice off ORDER_STATUS_CHANGED', () => {
    it('freezes an invoice, numbered, the moment the order reaches paid', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 19.9, taxClass: undefined });
        const order = await createOrder(user, [toOrderItem(product, 2)], {
            billingAddress: {
                fullName: 'Ada Lovelace',
                street: '1 Way',
                city: 'London',
                zip: 'W1A 1AA',
                country: 'GB'
            }
        });

        await markPaid(String(order._id));
        const invoice = await waitForInvoice(String(order._id));

        expect(invoice.number).toMatch(/^\d{4}-\d{6}$/);
        // Stored encrypted under the INVOICE's own id: the order's ciphertext was re-encrypted.
        expect(invoice.billingAddress?.fullName).not.toBe('Ada Lovelace');
        expect(decryptInvoiceParty(invoice.billingAddress!, 'invoice', invoice._id).fullName).toBe(
            'Ada Lovelace'
        );
        expect(invoice.lines).toHaveLength(1);
        expect(invoice.grandTotal).toBeCloseTo(39.8, 2);
    });

    it('bills the billing address, never the ship-to one', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            shippingAddress: {
                fullName: 'Grace Hopper',
                street: '2 Depot Rd',
                city: 'Leeds',
                zip: 'LS1 1AA',
                country: 'GB'
            },
            billingAddress: {
                fullName: 'Ada Lovelace',
                street: '1 Way',
                city: 'London',
                zip: 'W1A 1AA',
                country: 'GB'
            }
        });

        await markPaid(String(order._id));
        const invoice = await waitForInvoice(String(order._id));

        expect(decryptInvoiceParty(invoice.billingAddress!, 'invoice', invoice._id).fullName).toBe(
            'Ada Lovelace'
        );
    });

    it('carries no buyer address when the order recorded only a ship-to one', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            shippingAddress: {
                fullName: 'Grace Hopper',
                street: '2 Depot Rd',
                city: 'Leeds',
                zip: 'LS1 1AA',
                country: 'GB'
            }
        });

        await markPaid(String(order._id));
        const invoice = await waitForInvoice(String(order._id));

        expect(invoice.billingAddress).toBeUndefined();
    });

    // BR-CO-17: VAT is rounded once per rate, on the rate's whole taxable total. Three 0.10 lines
    // at the standard rate (22%) owe round(30 x 0.22/1.22) = 5 cents, where rounding each line
    // (round(1.80) = 2) and summing would bill 6.
    it('freezes VAT rounded once per rate, not summed from per-line rounded amounts', async () => {
        const user = await createUser();
        const products = await Promise.all(
            [0.1, 0.1, 0.1].map((price) => createProduct({ price }))
        );
        const order = await createOrder(
            user,
            products.map((product) => toOrderItem(product, 1))
        );

        await markPaid(String(order._id));
        const invoice = await waitForInvoice(String(order._id));

        // Read field by field: a Mongoose array of subdocuments is not plain data, and `toEqual` trips on it.
        expect(invoice.taxSummary).toHaveLength(1);
        const [row] = invoice.taxSummary;
        expect([row.rate, row.netAmount, row.taxAmount, row.grossAmount]).toEqual([
            0.22, 0.25, 0.05, 0.3
        ]);
        expect(invoice.taxTotal).toBe(0.05);
        expect(invoice.grandTotal).toBe(0.3);
    });

    // `rateType` rides frozen onto the order line at checkout (`orders/services/snapshot.ts`)
    // and freezes again onto the invoice line here — the field a rendered PDF needs to tell a
    // zero-rated line from an exempt one, neither of which `taxRate` alone can say.
    it('freezes the order line’s rateType onto the invoice line', async () => {
        const user = await createUser();
        const zeroRated = await createProduct({
            price: 10,
            taxClass: 'zero',
            rateType: 'zero-rated'
        });
        const exempt = await createProduct({ price: 20, taxClass: 'zero', rateType: 'exempt' });
        const order = await createOrder(user, [toOrderItem(zeroRated, 1), toOrderItem(exempt, 1)]);

        await markPaid(String(order._id));
        const invoice = await waitForInvoice(String(order._id));

        expect(invoice.lines.map((line) => line.rateType)).toEqual(['zero-rated', 'exempt']);
    });

    it('numbers two invoices in the same year one apart', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });
        const [orderA, orderB] = await Promise.all([
            createOrder(user, [toOrderItem(product, 1)]),
            createOrder(user, [toOrderItem(product, 1)])
        ]);

        await markPaid(String(orderA._id));
        await markPaid(String(orderB._id));
        const [invoiceA, invoiceB] = await Promise.all([
            waitForInvoice(String(orderA._id)),
            waitForInvoice(String(orderB._id))
        ]);

        const [yearA, seqA] = invoiceA.number.split('-', 2);
        const [yearB, seqB] = invoiceB.number.split('-', 2);
        expect(yearA).toBe(yearB);
        expect(Number(seqB) - Number(seqA)).toBe(1);
    });

    it('never issues a second invoice for the same order, and burns no number on the loser', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });
        const year = new Date().getUTCFullYear();

        // Two callers racing the same fact — a redelivered event, or two settlements — both call
        // this; the unique index refuses the second insert and its transaction gives the number back.
        const [first, second] = await Promise.all([issueInvoice(order), issueInvoice(order)]);

        expect(first?.number).toBe(second?.number);
        expect(String(first?._id)).toBe(String(second?._id));
        const stored = await invoicingRepository.findInvoiceByOrderId(String(order._id));
        expect(stored?.number).toBe(first?.number);
        const counter = await invoiceNumberCounterModel.findById(year).lean().exec();
        expect(counter?.seq).toBe(1);
    });

    it('answers the existing invoice when the order is invoiced again later', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });
        const year = new Date().getUTCFullYear();

        const first = await issueInvoice(order);
        const again = await issueInvoice(order);

        expect(String(again?._id)).toBe(String(first?._id));
        const counter = await invoiceNumberCounterModel.findById(year).lean().exec();
        expect(counter?.seq).toBe(1);
    });

    it('gives the number back when the insert fails for any other reason', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });
        const year = new Date().getUTCFullYear();
        const insert = jest
            .spyOn(invoicingRepository, 'insertInvoice')
            .mockRejectedValueOnce(new Error('disk full'));

        await expect(issueInvoice(order)).rejects.toThrow('disk full');
        insert.mockRestore();

        // The allocation shared the insert's transaction, so nothing was spent.
        expect(await invoiceNumberCounterModel.findById(year).lean().exec()).toBeNull();
        await expect(issueInvoice(order)).resolves.toMatchObject({ number: `${year}-000001` });
    });

    it('issues nothing for an order with no lines', async () => {
        const user = await createUser();
        const order = await createOrder(user, []);

        await markPaid(String(order._id));
        await new Promise((resolve) => setTimeout(resolve, 50));

        await expect(
            invoicingRepository.findInvoiceByOrderId(String(order._id))
        ).resolves.toBeNull();
    });
});
