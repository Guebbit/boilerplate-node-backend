/**
 * @module
 * The admin's RF-reference lookup (`services/lookup.ts`) and the offline endpoint
 * (`services/offline.ts`, covered on its own terms in `service.test.ts`) it feeds. What this pins
 * is the one thing unique to this path: the reference a real `bank_transfer` checkout would have
 * minted resolves back to its own order, a mistyped or unmatched one does not, and neither case
 * leaks which is true past a plain 404 — and the order the lookup found is the same one the
 * existing offline endpoint then settles, with no new settlement code in between.
 */
import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, readOrder, toOrderItem } from '@modules/orders/tests/factories';
import { getOrderByReference, recordOfflinePayment } from '@modules/payments/services';
import { buildReference } from '@modules/orders';
import type { ResponseReject } from '@infrastructure/http/response';

setupTestDb();

const asReject = (result: unknown) => result as ResponseReject;

const orderIdOf = (result: unknown) => String((result as { data?: { _id: unknown } }).data?._id);

/**
 * A pending `bank_transfer` order carrying the reference its own checkout would have minted —
 * the id is pinned first, exactly as `cart`'s checkout pins one, so the reference names the row
 * it is about to be written onto rather than a second id nobody else ever sees.
 */
const transferOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 20 });
    const id = new Types.ObjectId();
    const reference = buildReference(id.toHexString());
    const order = await createOrder(user, [toOrderItem(product, 1)], {
        id: id.toHexString(),
        paymentMethod: 'bank_transfer',
        transferReference: reference
    });
    return { order, reference };
};

describe('getOrderByReference', () => {
    it('finds the order behind its own RF reference', async () => {
        const { order, reference } = await transferOrder();

        const result = await getOrderByReference(reference);

        expect(result.success).toBe(true);
        expect(orderIdOf(result)).toBe(String(order._id));
    });

    it('tolerates the spacing and lowercase a customer might read it with off a bank statement', async () => {
        const { order, reference } = await transferOrder();
        const grouped = reference
            .match(/.{1,4}/g)!
            .join(' ')
            .toLowerCase();

        const result = await getOrderByReference(grouped);

        expect(result.success).toBe(true);
        expect(orderIdOf(result)).toBe(String(order._id));
    });

    it('finds an order that predates this field by its raw id', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            paymentMethod: 'bank_transfer'
        });

        const result = await getOrderByReference(String(order._id));

        expect(result.success).toBe(true);
        expect(orderIdOf(result)).toBe(String(order._id));
    });

    it('answers 404 for a one-character typo, rather than matching the wrong order', async () => {
        const { reference } = await transferOrder();
        const lastChar = reference.at(-1)!;
        const typo = `${reference.slice(0, -1)}${lastChar === '0' ? '1' : '0'}`;

        expect(asReject(await getOrderByReference(typo)).status).toBe(404);
    });

    it('answers 404 for a well-formed reference that matches no order', async () => {
        // A real reference, checksum and all, just never minted for any order this test wrote —
        // the lookup-miss branch, distinct from the checksum-rejection one above.
        const orphan = buildReference(new Types.ObjectId().toHexString());

        expect(asReject(await getOrderByReference(orphan)).status).toBe(404);
    });

    it('answers 404 for input that is neither a reference nor an ObjectId, same as a typo', async () => {
        expect(asReject(await getOrderByReference('not-a-reference')).status).toBe(404);
    });
});

describe("lookup then settle — the admin's two-step flow", () => {
    it('settles the order the lookup found, through the existing offline endpoint', async () => {
        const { order, reference } = await transferOrder();

        const found = await getOrderByReference(reference);
        expect(found.success).toBe(true);

        const settled = await recordOfflinePayment(
            orderIdOf(found),
            { method: 'bank_transfer', reference: 'bank statement line 42' },
            testCallerContext
        );

        expect(settled.success).toBe(true);
        const stored = await readOrder(String(order._id));
        expect(stored!.status).toBe('paid');
    });
});
