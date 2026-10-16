/**
 * @module
 * The staff Payments page's three reads — the list, the refunds, and what needs attention — and
 * what each audience is sent. Real Mongo: the subject is that every `displayStatus` label the
 * server derives is the label its filter finds, that the provider's ids reach staff only, and that
 * a needs-attention row clears once its stored problem is fixed.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { PaymentDisplayStatus, type PaymentAttentionItem } from '@types';
import type { PaymentDocument } from '@modules/payments/model';
import { paymentModel } from '@modules/payments/model';
import {
    getForOrder,
    listAttention,
    listPayments,
    listRefunds,
    methodMix,
    refundByOrder,
    refundForOrder,
    retryOpenRefunds
} from '@modules/payments/services';
import { withEnvironmentOverrides } from '@tests/environment';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asAdmin, asCustomer, callerContextAs } from '@tests/callers';
import { asSuccess } from '@tests/response';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
});

/** A refund record as the schema wants it, with the fields a case varies. */
const refundRecord = (overrides: Record<string, unknown> = {}) => ({
    amount: 10,
    currency: 'EUR',
    status: 'succeeded',
    reason: 'goodwill',
    idempotencyKey: `key-${Math.random().toString(36).slice(2)}`,
    ...overrides
});

/**
 * A payment on a fresh order, with whatever stored fields a case needs.
 * @param overrides - fields for the payment document
 */
/** Keeps every seeded customer's email unique. */
let sequence = 0;

const seedPayment = async (overrides: Record<string, unknown> = {}) => {
    sequence += 1;
    const user = await createUser({ email: `payer${String(sequence)}@example.com` });
    const product = await createProduct({ price: 50 });
    const order = await createOrder(user, [toOrderItem(product, 1)]);
    const payment = await paymentModel.create({
        orderId: order._id,
        userId: user._id,
        amount: 50,
        currency: 'EUR',
        status: 'succeeded',
        provider: 'fake',
        providerRef: `fake_pi_${String(order._id)}`,
        method: 'card',
        amountRefunded: 0,
        refunds: [],
        ...overrides
    });
    return { user, order, payment };
};

/** Backdates `updatedAt`, which a save would otherwise stamp with now. */
const backdate = (payment: PaymentDocument, minutesAgo: number) =>
    paymentModel
        .updateOne(
            { _id: payment._id },
            { updatedAt: new Date(Date.now() - minutesAgo * 60_000) },
            { timestamps: false }
        )
        .exec();

/** The ids on the first page of a staff list, in order. */
const idsOf = (filters: Parameters<typeof listPayments>[0]): Promise<string[]> =>
    listPayments(filters, asAdmin()).then(({ items }) => items.map((item) => item.id));

/** A payment whose one refund failed `hoursAgo` hours ago — a stale-refund problem. */
const staleRefund = (hoursAgo: number) =>
    seedPayment({
        amountRefunded: 10,
        refunds: [
            refundRecord({
                status: 'failed',
                createdAt: new Date(Date.now() - hoursAgo * 3_600_000)
            })
        ]
    });

/** The rows an attention read returns. */
const attentionRows = (): Promise<PaymentAttentionItem[]> =>
    listAttention().then(({ items }) => items);

/** One payment per label, keyed by the label it should read as. */
const seedEveryLabel = async (): Promise<Map<PaymentDisplayStatus, string>> => {
    const cases: [PaymentDisplayStatus, Record<string, unknown>][] = [
        [PaymentDisplayStatus.incomplete, { status: 'requires_action' }],
        [PaymentDisplayStatus.pending, { status: 'processing' }],
        [PaymentDisplayStatus.succeeded, {}],
        [
            PaymentDisplayStatus.refund_pending,
            { amountRefunded: 10, refunds: [refundRecord({ status: 'pending' })] }
        ],
        [
            PaymentDisplayStatus.partially_refunded,
            { amountRefunded: 10, refunds: [refundRecord()] }
        ],
        [
            PaymentDisplayStatus.refunded,
            { amountRefunded: 50, refunds: [refundRecord({ amount: 50 })] }
        ],
        [PaymentDisplayStatus.failed, { status: 'declined' }],
        [PaymentDisplayStatus.cancelled, { status: 'cancelled' }]
    ];
    const ids = new Map<PaymentDisplayStatus, string>();
    for (const [label, overrides] of cases) {
        const { payment } = await seedPayment(overrides);
        ids.set(label, String(payment._id));
    }
    return ids;
};

describe('listPayments by displayStatus', () => {
    it('finds, for every label, exactly the payment that derives to it', async () => {
        const ids = await seedEveryLabel();

        for (const [label, id] of ids) {
            const page = await listPayments({ displayStatus: label }, asAdmin());

            expect(page.items.map((item) => item.id)).toEqual([id]);
            expect(page.items[0].displayStatus).toBe(label);
        }
    });
});

describe('listPayments filters and sort', () => {
    it('narrows by method, provider, amount range, order id and reference', async () => {
        const card = await seedPayment({ amount: 50 });
        const cash = await seedPayment({
            amount: 120,
            method: 'cash',
            provider: 'manual',
            providerRef: undefined,
            reference: 'RCPT-9'
        });

        expect(await idsOf({ method: 'cash' })).toEqual([String(cash.payment._id)]);
        expect(await idsOf({ provider: 'fake' })).toEqual([String(card.payment._id)]);
        expect(await idsOf({ amountMin: 100 })).toEqual([String(cash.payment._id)]);
        expect(await idsOf({ amountMax: 60 })).toEqual([String(card.payment._id)]);
        expect(await idsOf({ orderId: String(card.order._id) })).toEqual([
            String(card.payment._id)
        ]);
        expect(await idsOf({ reference: 'RCPT-9' })).toEqual([String(cash.payment._id)]);
    });

    it('narrows by creation date and by the date offline money arrived', async () => {
        const old = await seedPayment({
            method: 'cash',
            receivedAt: new Date('2026-01-10T10:00:00Z'),
            createdAt: new Date('2026-01-10T10:00:00Z')
        });
        await seedPayment();

        const created = await listPayments({ createdTo: '2026-02-01T00:00:00Z' }, asAdmin());
        const received = await listPayments({ receivedFrom: '2026-01-01T00:00:00Z' }, asAdmin());

        expect(created.items.map((item) => item.id)).toEqual([String(old.payment._id)]);
        expect(received.items.map((item) => item.id)).toEqual([String(old.payment._id)]);
    });

    it('sorts by amount, either way', async () => {
        await seedPayment({ amount: 30 });
        await seedPayment({ amount: 90 });
        await seedPayment({ amount: 60 });

        const asc = await listPayments({ sort: ['amount'] }, asAdmin());
        const desc = await listPayments({ sort: ['-amount'] }, asAdmin());

        expect(asc.items.map((item) => item.amount)).toEqual([30, 60, 90]);
        expect(desc.items.map((item) => item.amount)).toEqual([90, 60, 30]);
    });

    it("composes each row with its order's number and email", async () => {
        const { order } = await seedPayment();

        const { items } = await listPayments({}, asAdmin());

        expect(items[0]).toMatchObject({ orderNumber: order.orderNumber, email: order.email });
    });
});

describe('what each audience is sent', () => {
    it('gives staff the provider ids and a failure reason, and the payer none of them', async () => {
        const { user, order } = await seedPayment({
            amountRefunded: 10,
            refunds: [
                refundRecord({
                    status: 'failed',
                    providerRefundRef: 're_1',
                    failureReason: 'lost_or_stolen_card'
                })
            ]
        });
        const orderId = String(order._id);

        const staff = asSuccess(await getForOrder(orderId, asAdmin())).data;
        const payer = asSuccess(await getForOrder(orderId, asCustomer(user.id))).data;
        const { items } = await listPayments({}, asAdmin());
        const [listed] = items;

        for (const payment of [staff, listed]) {
            expect(payment.providerRef).toBe(`fake_pi_${orderId}`);
            expect(payment.refunds[0]).toMatchObject({
                providerRefundRef: 're_1',
                failureReason: 'lost_or_stolen_card'
            });
        }
        expect(payer).not.toHaveProperty('providerRef');
        expect(JSON.stringify(payer)).not.toMatch(/re_1|lost_or_stolen_card/);
    });
});

describe('listRefunds', () => {
    it('lists one row per refund across payments, newest first, filtered', async () => {
        const first = await seedPayment({
            amountRefunded: 10,
            refunds: [refundRecord({ createdAt: new Date('2026-03-01T00:00:00Z') })]
        });
        const second = await seedPayment({
            amountRefunded: 30,
            refunds: [
                refundRecord({
                    status: 'failed',
                    reason: 'return',
                    amount: 20,
                    createdAt: new Date('2026-04-01T00:00:00Z')
                }),
                refundRecord({ amount: 10, createdAt: new Date('2026-02-01T00:00:00Z') })
            ]
        });

        const all = await listRefunds({});
        const failed = await listRefunds({ status: 'failed' });
        const early = await listRefunds({ createdTo: new Date('2026-02-15T00:00:00Z') });

        expect(all.items.map((row) => row.createdAt.slice(0, 10))).toEqual([
            '2026-04-01',
            '2026-03-01',
            '2026-02-01'
        ]);
        expect(all.items[0]).toMatchObject({
            paymentId: String(second.payment._id),
            orderId: String(second.order._id),
            reason: 'return'
        });
        expect(all.meta.totalItems).toBe(3);
        expect(failed.items).toHaveLength(1);
        expect(early.items.map((row) => row.paymentId)).toEqual([String(second.payment._id)]);
        expect(String(first.payment._id)).not.toBe(String(second.payment._id));
    });
});

describe('listAttention', () => {
    it('lists a stale provider refund, and drops it once the sweep has finished it', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_EFFECT_RETRY_MINUTES: '0' }, async () => {
            const { payment } = await seedPayment({
                amountRefunded: 10,
                refunds: [
                    refundRecord({
                        status: 'failed',
                        failureReason: 'provider_unavailable',
                        createdAt: new Date(Date.now() - 3 * 3_600_000)
                    })
                ]
            });
            await backdate(payment, 180);

            const before = await listAttention();
            expect(before.items).toEqual([
                expect.objectContaining({
                    kind: 'stale_refund',
                    paymentId: String(payment._id),
                    failureReason: 'provider_unavailable'
                })
            ]);

            expect(await retryOpenRefunds()).toBe(1);
            expect(await attentionRows()).toEqual([]);
        }));

    it(
        'lists the oldest problem first, and no more than 100 from one source',
        () =>
            withEnvironmentOverrides({ NODE_PAYMENT_EFFECT_RETRY_MINUTES: '0' }, async () => {
                // Oldest of all, then 100 younger ones: 101 in the source, 100 may come back.
                const oldest = await staleRefund(500);
                await Promise.all(
                    Array.from({ length: 100 }, (_, index) => staleRefund(index + 1))
                );

                const rows = await attentionRows();

                expect(rows).toHaveLength(100);
                const sinces = rows.map(({ since }) => since);
                expect(sinces).toEqual(sinces.toSorted());
                // The cap cuts the YOUNGEST: the oldest problem is the one that must not be dropped.
                expect(rows[0]).toMatchObject({ paymentId: String(oldest.payment._id) });
            }),
        60_000
    );

    it('leaves a refund still inside the threshold alone', async () => {
        await seedPayment({ amountRefunded: 10, refunds: [refundRecord({ status: 'pending' })] });

        expect(await attentionRows()).toEqual([]);
    });

    it('shows a refund owed by hand on a manual payment at any age', async () => {
        const { payment } = await seedPayment({
            provider: 'manual',
            providerRef: undefined,
            method: 'cash',
            amountRefunded: 50,
            refunds: [refundRecord({ amount: 50, status: 'pending' })]
        });

        expect(await attentionRows()).toEqual([
            expect.objectContaining({
                kind: 'manual_refund_owed',
                paymentId: String(payment._id)
            })
        ]);
    });

    it('shows a cancelled hand-paid order as owed by hand, once, until an operator confirms it', async () => {
        const { order } = await seedPayment({
            provider: 'manual',
            providerRef: undefined,
            method: 'cash'
        });
        const orderId = String(order._id);

        // The cancel's own refund listener: nobody can say the cash went back, so it only
        // opens the record. A redelivery of the same event writes nothing more.
        await refundForOrder(orderId);
        await refundForOrder(orderId);

        expect(await attentionRows()).toEqual([
            expect.objectContaining({
                kind: 'manual_refund_owed',
                orderId,
                amount: 50,
                currency: 'EUR'
            })
        ]);

        await refundByOrder(orderId, asAdmin(), callerContextAs('admin'));
        expect(await attentionRows()).toEqual([]);
    });
});

describe('methodMix', () => {
    it('groups the payments that took money by method and provider, and skips the rest', async () => {
        await seedPayment({ amount: 50 });
        await seedPayment({
            amount: 30,
            amountRefunded: 30,
            refunds: [refundRecord({ amount: 30 })]
        });
        await seedPayment({
            amount: 20,
            method: 'cash',
            provider: 'manual',
            providerRef: undefined
        });
        // Never took money.
        await seedPayment({ amount: 99, status: 'declined' });
        await seedPayment({ amount: 99, status: 'requires_confirmation' });

        const rows = await methodMix({
            from: new Date(Date.now() - 3_600_000),
            to: new Date(Date.now() + 3_600_000),
            interval: 'day',
            timeZone: 'Europe/Rome'
        });

        expect(rows.toSorted((a, b) => a.method.localeCompare(b.method))).toEqual([
            { method: 'card', provider: 'fake', currency: 'EUR', payments: 2, amount: 8000 },
            { method: 'cash', provider: 'manual', currency: 'EUR', payments: 1, amount: 2000 }
        ]);
    });
});
