/**
 * @module
 * The manifest's `reencrypt` walk: after a PII key rotation, an order's frozen addresses and
 * notes move from `v1` to `v2`, and the order still serializes. Read back raw, below the
 * repository's own decrypt, to see the stamped version.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironmentOverrides } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { keyVersionOf } from '@infrastructure/security/versioned-secret';
import ordersModule from '../../module';
import { orderModel } from '../../model';
import { createOrder, toOrderItem } from '../factories';

setupTestDb();

/** A deployment mid-rotation: a new `v2` key in front, the worker's bare (`v1`) test key behind. */
const ROTATED_PII_KEY = 'v2:new-pii-key-material,v1:test-pii-encryption-key';

describe('orders reencrypt', () => {
    it('moves addresses and notes to v2 and the order still serializes', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            shippingAddress: {
                fullName: 'Ada Lovelace',
                street: '12 Analytical Engine Rd',
                city: 'London',
                zip: 'SW1A',
                country: 'GB'
            },
            notes: 'Leave with the concierge'
        });

        await withEnvironmentOverrides({ NODE_PII_ENCRYPTION_KEY: ROTATED_PII_KEY }, async () => {
            const report = await ordersModule.reencrypt(false);

            expect(report.rewritten).toBe(6);
            const raw = await orderModel.collection.findOne({ _id: order._id });
            expect(keyVersionOf(raw?.notes as string)).toBe('v2');
            const reloaded = await orderModel.findById(order._id).exec();
            expect(reloaded?.toJSON().shippingAddress?.city).toBe('London');
        });
    });
});
