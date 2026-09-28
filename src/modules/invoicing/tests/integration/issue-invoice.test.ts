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
import { invoicingRepository } from '../../repository';

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
            shippingAddress: {
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
        expect(invoice.billingAddress?.fullName).toBe('Ada Lovelace');
        expect(invoice.lines).toHaveLength(1);
        expect(invoice.grandTotal).toBeCloseTo(39.8, 2);
    });

    // C4: `rateType` rides frozen onto the order line at checkout (`orders/services/snapshot.ts`)
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

        const [yearA, seqA] = invoiceA.number.split('-');
        const [yearB, seqB] = invoiceB.number.split('-');
        expect(yearA).toBe(yearB);
        expect(Number(seqB) - Number(seqA)).toBe(1);
    });

    it('never issues a second invoice for the same order', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });

        // Two callers racing the same fact — a redelivered event, or two settlements — both call
        // this; `repository.ts`'s unique index is what makes it idempotent, not the caller.
        const [first, second] = await Promise.all([
            invoicingRepository.insertInvoice({
                orderId: order._id,
                number: '2026-000001',
                issuedAt: new Date(),
                currency: 'EUR',
                locale: 'en',
                seller: {},
                lines: [{ title: 'Widget', quantity: 1, unitPrice: 10, taxRate: 0.22 }],
                netTotal: 8.2,
                taxTotal: 1.8,
                shippingNetAmount: 0,
                shippingTaxAmount: 0,
                taxSummary: [],
                shippingByRate: [],
                grandTotal: 10
            }),
            invoicingRepository.insertInvoice({
                orderId: order._id,
                number: '2026-000002',
                issuedAt: new Date(),
                currency: 'EUR',
                locale: 'en',
                seller: {},
                lines: [{ title: 'Widget', quantity: 1, unitPrice: 10, taxRate: 0.22 }],
                netTotal: 8.2,
                taxTotal: 1.8,
                shippingNetAmount: 0,
                shippingTaxAmount: 0,
                taxSummary: [],
                shippingByRate: [],
                grandTotal: 10
            })
        ]);

        expect(first.number).toBe(second.number);
        const stored = await invoicingRepository.findInvoiceByOrderId(String(order._id));
        expect(stored?.number).toBe(first.number);
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
