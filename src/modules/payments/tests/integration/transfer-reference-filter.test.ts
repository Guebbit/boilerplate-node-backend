/**
 * @module
 * The staff list's `transferReference` filter (`services/list.ts`) and the offline endpoint
 * (`services/offline.ts`) it feeds. What this pins is the one thing unique to this path: the
 * reference a bank-transfer payment carries finds its own payment, in any spacing and case, a
 * mistyped or unmatched one finds nothing, and the order the filter named is the same one the
 * existing offline endpoint then settles, with no new settlement code in between.
 */
import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { asAdmin, callerContextAs } from '@tests/callers';
import { readOrder } from '@modules/orders/tests/factories';
import { paymentService } from '@modules/payments/services';
import { buildReference } from '../../domain';
import { transferOrder } from '../factories';

setupTestDb();

/**
 * The order ids of the payments a staff list holds for one `transferReference`. The rows carry the
 * stored ObjectId until they are serialized, so they are compared as text.
 */
const orderIdsFor = (transferReference: string) =>
    paymentService
        .listPayments({ transferReference }, asAdmin())
        .then(({ items }) => items.map((row: { orderId: unknown }) => String(row.orderId)));

describe('the transferReference filter', () => {
    it('finds the payment behind its own RF reference', async () => {
        const { order, reference } = await transferOrder();

        expect(await orderIdsFor(reference)).toEqual([String(order._id)]);
    });

    it('tolerates the spacing and lowercase a customer might read it with off a bank statement', async () => {
        const { order, reference } = await transferOrder();
        const grouped = reference
            .match(/.{1,4}/g)!
            .join(' ')
            .toLowerCase();

        expect(await orderIdsFor(grouped)).toEqual([String(order._id)]);
    });

    it('a raw ObjectId is not a reference: it finds nothing', async () => {
        const { order } = await transferOrder();

        expect(await orderIdsFor(String(order._id))).toEqual([]);
    });

    it('finds nothing for a one-character typo, rather than matching the wrong order', async () => {
        const { reference } = await transferOrder();
        const lastChar = reference.at(-1)!;
        const typo = `${reference.slice(0, -1)}${lastChar === '0' ? '1' : '0'}`;

        expect(await orderIdsFor(typo)).toEqual([]);
    });

    it('finds nothing for a well-formed reference that was never minted for a payment', async () => {
        // A real reference, checksum and all: the miss branch, distinct from the checksum rejection.
        const orphan = buildReference(new Types.ObjectId().toHexString());

        expect(await orderIdsFor(orphan)).toEqual([]);
    });

    it('answers an empty page, with its meta, for input that is not a reference at all', async () => {
        const page = await paymentService.listPayments(
            { transferReference: 'not-a-reference' },
            asAdmin()
        );

        expect(page).toEqual({
            items: [],
            meta: expect.objectContaining({ totalItems: 0, totalPages: 0 }) as unknown
        });
    });
});

describe("filter then settle — the admin's two-step flow", () => {
    it('settles the order the filter named, through the existing offline endpoint', async () => {
        const { order, reference } = await transferOrder();

        const [orderId] = await orderIdsFor(reference);
        const settled = await paymentService.recordOfflinePayment(
            orderId,
            { method: 'bank_transfer', reference: 'bank statement line 42' },
            callerContextAs('admin')
        );

        expect(settled.success).toBe(true);
        const stored = await readOrder(String(order._id));
        expect(stored!.status).toBe('paid');
    });
});
