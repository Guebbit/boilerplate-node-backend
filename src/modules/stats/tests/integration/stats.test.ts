/**
 * @module
 * The sales numbers over a real database: orders paid either side of shop-local midnight, their
 * invoices and a credit note issued under a frozen clock, then read back through the service. The
 * subject is the edges — a 23:30 UTC sale belongs to the next shop day in `Europe/Rome`, a refund
 * lands on its own day, a customer is new once — and that every composed figure agrees with the
 * documents behind it. `NODE_SHOP_TIMEZONE` is `Europe/Rome` here, so this is also the one test that
 * passes a real zone name through `$dateTrunc` on the Mongo binary.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { freezeDate } from '@tests/clock';
import { OrderStatus } from '@types';
import usersModule from '@modules/users/module';
import productsModule from '@modules/products/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import invoicingModule from '@modules/invoicing/module';
import { invoicingService } from '@modules/invoicing';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, detachOrderUserId, toOrderItem } from '@modules/orders/tests/factories';
import type { OrderDocument } from '@modules/orders';
import { statsService } from '../../services';
import { resolvePeriod, type Period } from '../../services/range';
import { issueCreditNote } from '@modules/invoicing/tests/factories';

setupTestDb();

beforeEach(() => {
    registerModules([usersModule, productsModule, inventoryModule, ordersModule, invoicingModule]);
});

afterEach(() => {
    resetDomainEvents();
});

/** Keeps every seeded customer's email unique. */
let sequence = 0;

/**
 * Issues a document under a clock frozen at `at`, since the issue date is the listener's own clock.
 * @param at - the instant the document is issued
 * @param issue - what to issue
 */
const issuedAt = async <T>(at: string, issue: () => Promise<T>): Promise<T> => {
    freezeDate(new Date(at));
    try {
        return await issue();
    } finally {
        jest.useRealTimers();
    }
};

/** A customer, one by name so a test can give the same one two orders. */
const customer = () => {
    sequence += 1;
    return createUser({ email: `shopper${String(sequence)}@example.com` });
};

/**
 * A paid order and its invoice, both dated `paidAt`. A 122.00 unit is 100.00 net and 22.00 VAT.
 * @param options - who, how many units of which product, when it was paid, and optionally the currency
 */
const paidOrder = async (options: {
    user: Awaited<ReturnType<typeof customer>>;
    product: Awaited<ReturnType<typeof createProduct>>;
    quantity: number;
    paidAt: string;
    currency?: string;
}): Promise<OrderDocument> => {
    const order = await createOrder(
        options.user,
        [toOrderItem(options.product, options.quantity)],
        {
            status: OrderStatus.paid,
            paidAt: options.paidAt,
            createdAt: options.paidAt,
            ...(options.currency ? { currency: options.currency } : {})
        }
    );
    await issuedAt(options.paidAt, () => invoicingService.issueInvoice(order));
    return order;
};

/**
 * The period for two shop-local days.
 * @param from - first day
 * @param to - last day
 * @param interval - bucket size
 */
const periodOf = (from: string, to: string, interval: 'day' | 'week' | 'month' = 'day'): Period => {
    const resolved = resolvePeriod({ from, to, interval });
    if (!('period' in resolved)) throw new Error(`refused: ${resolved.refusal}`);
    return resolved.period;
};

/**
 * Seeds the scenario every case reads.
 *
 *  - A: first-time customer, 1 unit, paid 23:30 Rome on the 10th (22:30 UTC)
 *  - B: a customer who also paid in February, 2 units, paid 00:30 Rome on the 11th (23:30 UTC the 10th)
 *  - C: B's customer, February, outside the period
 *  - credit note for all of A on the 12th
 *  - F: a cancelled order placed in the period; E: a bank transfer still owed
 */
const seedScenario = async () => {
    const product = await createProduct({ price: 122, categories: ['shoes'] });
    const first = await customer();
    const regular = await customer();
    const a = await paidOrder({
        user: first,
        product,
        quantity: 1,
        paidAt: '2026-03-10T22:30:00Z'
    });
    await paidOrder({ user: regular, product, quantity: 2, paidAt: '2026-03-10T23:30:00Z' });
    await paidOrder({ user: regular, product, quantity: 1, paidAt: '2026-02-01T10:00:00Z' });
    await issuedAt('2026-03-12T10:00:00Z', () =>
        issueCreditNote({
            orderId: String(a._id),
            refundId: 'refund-a',
            amount: 122,
            full: true
        })
    );
    await createOrder(first, [toOrderItem(product, 1)], {
        status: OrderStatus.cancelled,
        createdAt: '2026-03-12T09:00:00Z'
    });
    await createOrder(first, [toOrderItem(product, 1)], {
        paymentMethod: 'bank_transfer',
        payBy: '2026-04-01T00:00:00Z',
        createdAt: '2026-02-20T09:00:00Z'
    });
    return { product, firstCustomer: first, regular };
};

describe('getSalesStats', () => {
    it('dates a sale by the shop day, so 23:30 UTC belongs to the next day in Rome', async () => {
        await seedScenario();

        const stats = await statsService.getSalesStats(periodOf('2026-03-09', '2026-03-13'));

        const [eur] = stats.currencies;
        expect(eur.currency).toBe('EUR');
        const byDay = Object.fromEntries(
            eur.buckets.map((bucket) => [bucket.start, bucket.figures.orders])
        );
        // Shop-local midnights: the 10th starts 23:00 UTC on the 9th (winter, +01:00).
        expect(byDay).toEqual({
            '2026-03-08T23:00:00.000Z': 0,
            '2026-03-09T23:00:00.000Z': 1,
            '2026-03-10T23:00:00.000Z': 1,
            '2026-03-11T23:00:00.000Z': 0,
            '2026-03-12T23:00:00.000Z': 0
        });
    });

    // Summing 122 EUR and 122 USD into one figure would be a wrong number on the money dashboard.
    it('keeps each currency in its own group, never adding one to another', async () => {
        const product = await createProduct({ price: 122 });
        await paidOrder({
            user: await customer(),
            product,
            quantity: 1,
            paidAt: '2026-03-10T10:00:00Z'
        });
        await paidOrder({
            user: await customer(),
            product,
            quantity: 2,
            paidAt: '2026-03-10T11:00:00Z',
            currency: 'USD'
        });

        const { currencies } = await statsService.getSalesStats(
            periodOf('2026-03-09', '2026-03-13')
        );

        expect(
            Object.fromEntries(
                currencies.map(({ currency, totals }) => [
                    currency,
                    [totals.orders, totals.netSales]
                ])
            )
        ).toEqual({ EUR: [1, 100], USD: [1, 200] });
    });

    // The invoice stays, which is right for accounting; the order count and the product tables lose it.
    it('keeps a deleted order’s money in net sales while its count leaves', async () => {
        const product = await createProduct({ price: 122 });
        await paidOrder({
            user: await customer(),
            product,
            quantity: 1,
            paidAt: '2026-03-10T10:00:00Z'
        });
        const gone = await createOrder(await customer(), [toOrderItem(product, 1)], {
            status: OrderStatus.paid,
            paidAt: '2026-03-10T11:00:00Z',
            createdAt: '2026-03-10T11:00:00Z',
            deletedAt: '2026-03-11T12:00:00Z'
        });
        await issuedAt('2026-03-10T11:00:00Z', () => invoicingService.issueInvoice(gone));

        const { currencies } = await statsService.getSalesStats(
            periodOf('2026-03-09', '2026-03-13')
        );

        expect(currencies[0].totals).toMatchObject({ orders: 1, netSales: 200 });
    });

    it('totals the period: gross, reversals on their own day, net, VAT, refunds, average', async () => {
        await seedScenario();

        const { currencies } = await statsService.getSalesStats(
            periodOf('2026-03-09', '2026-03-13')
        );
        const [eur] = currencies;

        expect(eur.totals).toMatchObject({
            orders: 2,
            unitsOrdered: 3,
            grossSales: 300,
            discounts: 0,
            reversals: 100,
            netSales: 200,
            shipping: 0,
            taxes: 44,
            totalSales: 244,
            refunds: 122,
            averageOrderValue: 150
        });
        // The reversal sits on the 12th, not on the day A was sold.
        const credited = eur.buckets.find((bucket) => bucket.figures.reversals > 0);
        expect(credited?.start).toBe('2026-03-11T23:00:00.000Z');
        expect(credited?.figures.orders).toBe(0);
    });

    it('is the same total whatever the bucket size, since buckets only partition it', async () => {
        await seedScenario();

        const day = await statsService.getSalesStats(periodOf('2026-03-01', '2026-03-31', 'day'));
        const week = await statsService.getSalesStats(periodOf('2026-03-01', '2026-03-31', 'week'));
        const month = await statsService.getSalesStats(
            periodOf('2026-03-01', '2026-03-31', 'month')
        );

        expect(week.currencies[0].totals).toEqual(day.currencies[0].totals);
        expect(month.currencies[0].totals).toEqual(day.currencies[0].totals);
        expect(month.currencies[0].buckets).toHaveLength(1);
        // Weeks start on Monday: 2026-03-01 is a Sunday, so the first week starts on the 23rd of February.
        expect(week.currencies[0].buckets[0].start).toBe('2026-02-22T23:00:00.000Z');
    });

    it('carries the equal-length period before, for the vs-previous figure', async () => {
        await seedScenario();

        // One day, 2 February: the day before is 1 February, which holds C.
        const stats = await statsService.getSalesStats(periodOf('2026-02-02', '2026-02-02'));
        const [eur] = stats.currencies;

        expect(eur.totals.orders).toBe(0);
        expect(eur.previous.orders).toBe(1);
        expect(eur.previous.grossSales).toBe(100);
    });

    it('reads an empty period as zeros in the shop currency, not as nothing', async () => {
        const stats = await statsService.getSalesStats(periodOf('2026-05-01', '2026-05-03'));

        expect(stats.currencies).toHaveLength(1);
        expect(stats.currencies[0].totals).toMatchObject({ orders: 0, netSales: 0, totalSales: 0 });
        expect(stats.currencies[0].buckets).toHaveLength(3);
    });
});

describe('the breakdowns', () => {
    it('ranks products and categories by net sales, VAT out', async () => {
        const { product } = await seedScenario();
        const period = periodOf('2026-03-09', '2026-03-13');

        const products = await statsService.getProductStats(period, 10);
        const categories = await statsService.getCategoryStats(period);

        expect(products.products).toEqual([
            {
                productId: String(product._id),
                title: product.title,
                currency: 'EUR',
                unitsOrdered: 3,
                unitsReversed: 0,
                netUnits: 3,
                netSales: 300
            }
        ]);
        expect(categories.categories).toEqual([
            { category: 'shoes', currency: 'EUR', unitsOrdered: 3, netSales: 300 }
        ]);
    });

    it("gives one product's units per shop day, every bucket present", async () => {
        const { product } = await seedScenario();

        const series = await statsService.getProductSeries(
            periodOf('2026-03-10', '2026-03-12'),
            String(product._id)
        );

        expect(series.title).toBe(product.title);
        expect(series.buckets.map((bucket) => bucket.unitsOrdered)).toEqual([1, 2, 0]);
    });

    it('counts a customer as new once, and never by email', async () => {
        await seedScenario();

        const stats = await statsService.getCustomerStats(periodOf('2026-03-09', '2026-03-13'));

        expect(stats).toMatchObject({
            customers: 2,
            newCustomers: 1,
            returningCustomers: 1,
            returningRate: 0.5
        });
    });

    it('does not count erased accounts as customers: their orders share a placeholder email', async () => {
        const product = await createProduct({ price: 122 });
        const first = await customer();
        await paidOrder({ user: first, product, quantity: 1, paidAt: '2026-03-10T10:00:00Z' });
        // An erased account's paid orders keep the placeholder address and lose the account.
        const erased = await createUser({ email: 'anonymized@deleted.invalid' });
        for (const paidAt of ['2026-03-10T11:00:00Z', '2026-03-11T11:00:00Z'])
            await paidOrder({ user: erased, product, quantity: 1, paidAt });
        await detachOrderUserId(erased.id, new Date());

        const stats = await statsService.getCustomerStats(periodOf('2026-03-09', '2026-03-13'));

        expect(stats).toMatchObject({ customers: 1, newCustomers: 1, returningCustomers: 0 });
    });

    it('rates the cancellation cohort, and refunds against what was invoiced', async () => {
        await seedScenario();

        const stats = await statsService.getOperationsStats(periodOf('2026-03-09', '2026-03-13'));

        // A and B were placed in the period, and so was the cancelled F.
        expect(stats.cancellation).toEqual({ placed: 3, cancelled: 1, rate: 1 / 3 });
        expect(stats.refunds).toEqual([
            { currency: 'EUR', invoiced: 366, credited: 122, rate: 122 / 366 }
        ]);
        expect(stats.returns).toEqual({ unitsOrdered: 3, unitsReturned: 0, rate: 0 });
    });

    it('snapshots the pipeline: transfers owed and paid orders not shipped', async () => {
        await seedScenario();

        const stats = await statsService.getPipelineStats();

        expect(stats.awaitingTransfers).toEqual([
            {
                currency: 'EUR',
                count: 1,
                amount: 122,
                nearestPayBy: '2026-04-01T00:00:00.000Z'
            }
        ]);
        // A, B and C are `paid`; none has shipped.
        expect(stats.paidNotShipped).toBe(3);
    });

    // Each case below seeds only what it reads, so it fails for its own reason.
    it('counts a product in every category it belongs to', async () => {
        const product = await createProduct({ price: 122, categories: ['shoes', 'sale'] });
        await paidOrder({
            user: await customer(),
            product,
            quantity: 1,
            paidAt: '2026-03-10T10:00:00Z'
        });

        const { categories } = await statsService.getCategoryStats(
            periodOf('2026-03-09', '2026-03-13')
        );

        expect(categories.map(({ category, netSales }) => [category, netSales]).toSorted()).toEqual(
            [
                ['sale', 100],
                ['shoes', 100]
            ]
        );
    });

    it('ranks the top products by net sales, biggest first', async () => {
        const small = await createProduct({ title: 'Small seller', price: 122 });
        const big = await createProduct({ title: 'Big seller', price: 122 });
        const user = await customer();
        await paidOrder({ user, product: small, quantity: 1, paidAt: '2026-03-10T10:00:00Z' });
        await paidOrder({ user, product: big, quantity: 3, paidAt: '2026-03-10T11:00:00Z' });

        const { products } = await statsService.getProductStats(
            periodOf('2026-03-09', '2026-03-13'),
            10
        );

        expect(products.map(({ title }) => title)).toEqual(['Big seller', 'Small seller']);
    });

    it('counts a processing order as paid and not shipped', async () => {
        const product = await createProduct({ price: 122 });
        const user = await customer();
        await createOrder(user, [toOrderItem(product, 1)], { status: OrderStatus.paid });
        await createOrder(user, [toOrderItem(product, 1)], { status: OrderStatus.processing });
        await createOrder(user, [toOrderItem(product, 1)], { status: OrderStatus.delivered });

        const stats = await statsService.getPipelineStats();

        expect(stats.paidNotShipped).toBe(2);
    });

    it('leaves a deleted order out of the counts', async () => {
        const { product, firstCustomer } = await seedScenario();
        const gone = await createOrder(firstCustomer, [toOrderItem(product, 5)], {
            status: OrderStatus.paid,
            paidAt: '2026-03-10T12:00:00Z',
            deletedAt: '2026-03-11T12:00:00Z'
        });

        const stats = await statsService.getProductStats(periodOf('2026-03-09', '2026-03-13'), 10);

        expect(gone.deletedAt).toBeDefined();
        expect(stats.products[0].unitsOrdered).toBe(3);
    });
});
