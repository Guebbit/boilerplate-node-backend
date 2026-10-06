/**
 * @module
 * `reencryptInvoices`: the buyer address frozen on an invoice moves from the old PII key to the
 * new one, and still decrypts under the invoice's own id.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import usersModule from '@modules/users/module';
import productsModule from '@modules/products/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import invoicingModule from '@modules/invoicing/module';
import { markPaid } from '@modules/orders';
import { createProduct } from '@modules/products/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { invoiceModel } from '../../model';
import { decryptInvoiceParty } from '../../pii';
import { reencryptInvoices } from '../../services';
import { withEnvironment } from '@tests/environment';
import { versionOf } from '@infrastructure/security/versioned-secret';
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

describe('reencryptInvoices', () => {
    it('moves the buyer address to the newest key, and a second run changes nothing', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
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
        const rotation = 'v2:new-pii-key-material,v1:test-pii-encryption-key';

        await withEnvironment('NODE_PII_ENCRYPTION_KEY', rotation, async () => {
            const first = await reencryptInvoices();
            expect(first.rewritten).toBe(5);
            const second = await reencryptInvoices();
            expect(second.rewritten).toBe(0);

            const raw = await invoiceModel.findById(invoice._id).exec();
            expect(versionOf(raw!.billingAddress!.city)).toBe('v2');
            expect(decryptInvoiceParty(raw!.billingAddress!, 'invoice', raw!._id).city).toBe(
                'London'
            );
        });
    });
});
