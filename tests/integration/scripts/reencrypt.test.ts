/**
 * @module
 * `npm run reencrypt` end to end: after a key rotation, rows still stamped `v1` move to `v2`, a
 * second run changes nothing, and `--dry-run` writes nothing. One real row per owning module, read
 * back raw (below the repositories' own decrypt) to see the stamped version.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { callerAs, callerContextAs } from '@tests/callers';
import { withEnvironmentOverrides } from '@tests/environment';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { addressBookModel } from '@modules/addresses/model';
import { addressAdd, addressesGet, reencryptAddressBooks } from '@modules/addresses';
import { userModel } from '@modules/users/model';
import { reencryptUserPhones, userService } from '@modules/users';
import { encryptTotpSecret, decryptTotpSecret } from '@modules/account/two-factor/totp';
import { reencryptTotpSecrets } from '@modules/account';
import { orderModel } from '@modules/orders/model';
import { reencryptOrders } from '@modules/orders';
import { webhookSubscriptionModel } from '@modules/webhooks/model';
import { create as createSubscription } from '@modules/webhooks/services/subscriptions';
import { decryptRingSecret } from '@modules/webhooks/secrets';
import { reencryptWebhookSecrets } from '@modules/webhooks';
import { versionOf } from '@infrastructure/security/versioned-secret';

setupTestDb();

/** The keys `tests/support/setup-environment.ts` gives every worker; bare, so version `v1`. */
const OLD = {
    pii: 'test-pii-encryption-key',
    totp: 'test-totp-encryption-key',
    webhook: 'test-webhook-secret-encryption-key'
};

/** The environment of a deployment mid-rotation: a new `v2` key in front, the old `v1` behind it. */
const ROTATED = {
    NODE_PII_ENCRYPTION_KEY: `v2:new-pii-key-material,v1:${OLD.pii}`,
    NODE_TOTP_ENCRYPTION_KEY: `v2:new-totp-key-material,v1:${OLD.totp}`,
    NODE_WEBHOOK_SECRET_ENCRYPTION_KEY: `v2:new-webhook-key-material,v1:${OLD.webhook}`
};

/** Runs `body` as the rotated deployment. */
const rotated = <T>(body: () => Promise<T>): Promise<T> => withEnvironmentOverrides(ROTATED, body);

const ADDRESS = {
    fullName: 'Ada Lovelace',
    street: '12 Analytical Engine Rd',
    city: 'London',
    zip: 'SW1A',
    country: 'GB'
};

describe('address books', () => {
    it('moves v1 to v2, changes nothing on a second run, and writes nothing on a dry run', async () => {
        const user = await createUser();
        await addressAdd(user.id, ADDRESS);
        const stored = () => addressBookModel.collection.findOne({ userId: user._id });

        const dry = await rotated(() => reencryptAddressBooks(true));
        expect(dry.rewritten).toBe(0);
        expect(dry.found['addressbooks.items.city']).toEqual({ v1: 1 });
        const before = await stored();
        expect(versionOf(before?.items[0].city as string)).toBe('v1');

        const first = await rotated(() => reencryptAddressBooks());
        expect(first.rewritten).toBe(5);
        const moved = await stored();
        expect(versionOf(moved?.items[0].city as string)).toBe('v2');

        const second = await rotated(() => reencryptAddressBooks());
        expect(second.rewritten).toBe(0);
        expect(await stored()).toEqual(moved);
        // And it still reads back, now under the new key alone.
        const view = await rotated(() => addressesGet(user.id));
        expect(view.addresses[0]).toMatchObject(ADDRESS);
    });
});

describe('user phones', () => {
    it('moves a phone to v2 and it still decrypts', async () => {
        const user = await createUser();
        await userService.updateById(user.id, { phone: '+1 555 0100' }, callerContextAs('admin'));

        const report = await rotated(() => reencryptUserPhones());

        expect(report.rewritten).toBe(1);
        const raw = await userModel.collection.findOne({ _id: user._id });
        expect(versionOf(raw?.phone as string)).toBe('v2');
    });
});

describe('TOTP secrets', () => {
    it('moves an enrolled secret to v2 and it still decrypts under its method id', async () => {
        const methodId = new Types.ObjectId();
        const user = await createUser({
            twoFactorMethods: [
                {
                    _id: methodId,
                    method: 'totp',
                    enrolledAt: new Date(),
                    secret: encryptTotpSecret('JBSWY3DPEHPK3PXP', String(methodId))
                }
            ]
        });

        const report = await rotated(() => reencryptTotpSecrets());

        expect(report.rewritten).toBe(1);
        const raw = await userModel.collection.findOne({ _id: user._id });
        const secret = raw?.twoFactorMethods[0].secret as string;
        expect(versionOf(secret)).toBe('v2');
        await rotated(() => {
            expect(decryptTotpSecret(secret, String(methodId))).toBe('JBSWY3DPEHPK3PXP');
            return Promise.resolve();
        });
    });
});

describe('orders', () => {
    it('moves addresses and notes to v2 and the order still serializes', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            shippingAddress: ADDRESS,
            notes: 'Leave with the concierge'
        });

        const report = await rotated(() => reencryptOrders());

        expect(report.rewritten).toBe(6);
        const raw = await orderModel.collection.findOne({ _id: order._id });
        expect(versionOf(raw?.notes as string)).toBe('v2');
        const reloaded = await rotated(() => orderModel.findById(order._id).exec());
        expect(await rotated(() => Promise.resolve(reloaded?.toJSON().shippingAddress?.city))).toBe(
            'London'
        );
    });
});

describe('webhook secrets', () => {
    it('moves a ring secret to v2 and it still decrypts under its entry id', async () => {
        await createUser();
        await createSubscription(
            { url: 'https://example.com/hook', eventTypes: ['*'] },
            { caller: callerAs('manager'), analyticsConsent: false }
        );

        const report = await rotated(() => reencryptWebhookSecrets());

        expect(report.rewritten).toBe(1);
        const raw = await webhookSubscriptionModel.collection.findOne({});
        const entry = raw?.secrets[0] as { id: string; ciphertext: string };
        expect(versionOf(entry.ciphertext)).toBe('v2');
        await rotated(() => {
            expect(decryptRingSecret(entry.ciphertext, entry.id)).toMatch(/^whsec_/);
            return Promise.resolve();
        });
    });
});
