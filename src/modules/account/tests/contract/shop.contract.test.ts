/**
 * @module
 * Contract tests for the parts of /account that reach into the shop: the personal-data export's
 * orders and payments, and the address snapshot a checkout carries. Kept apart from the rest of
 * the /account contract so removing the shop takes exactly this file with it.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { checkoutAs } from '@tests/checkout-as';
import { requestAndDownloadExport } from '@tests/account-export';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { createIntent, confirmPayment, paymentService } from '@modules/payments';
import { invoicingService } from '@modules/invoicing';
import { asAdmin, asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import type { ResponseSuccess } from '@infrastructure/http/response';
import type { Payment } from '@types';
import { loginWithCookie } from './support';
import { emptyFileSandbox } from '@tests/file-sandbox';
import { settleInlineExports } from '../../services/export';

setupTestDb();

// A requested export is built in the background and written to the sandbox: wait, then sweep.
afterEach(() => settleInlineExports().then(emptyFileSandbox));

/** Polls until a fire-and-forget listener's write has landed (the count reaches 1), or gives up. */
const waitForCount = async (count: () => Promise<number>, timeoutMs = 3000): Promise<void> => {
    const startedAt = Date.now();
    while ((await count()) < 1) {
        if (Date.now() - startedAt > timeoutMs) throw new Error('waitForCount: timed out');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

/** The metadata an exported session may carry, and nothing more: never a credential. */
const EXPORTED_SESSION_KEYS = new Set(['id', 'createdAt', 'expiration', 'lastUsedAt', 'device']);

describe('POST /account/export', () => {
    it("returns the caller's own data across collections, and satisfies the contract", async () => {
        const { user, bearer } = await loginWithCookie();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 2)]);
        const intent = await createIntent(String(order._id), asCustomer(user.id));
        const payment = (intent as ResponseSuccess<Payment>).data;

        const response = await requestAndDownloadExport(bearer);

        expect(response.request.status).toBe(202);
        expect(response.status).toBe(200);
        const data = response.data as {
            profile: { email: string };
            orders: { id: string }[];
            payments: { id: string; orderId: string }[];
            cart: unknown[];
            wishlist: unknown[];
            sessions: { id: string; createdAt: string; expiration: string }[];
        };
        expect(data.profile.email).toBe(user.email);
        expect(data.orders.map((each) => each.id)).toContain(String(order._id));
        // `paymentService.findOwnPaymentsForExport` (payments/services/retention.ts) is the only
        // path this hits — nothing else exercises its pagination read, so a broken page-walk (or
        // the whole read swallowed) would only ever surface here.
        expect(data.payments.map((each) => each.id)).toContain(payment.id);
        expect(data.payments.find((each) => each.id === payment.id)?.orderId).toBe(
            String(order._id)
        );
        // The caller's own login, as metadata only: never a credential, and nothing but its handle.
        expect(data.sessions).toHaveLength(1);
        // `lastUsedAt` (once the session was used) and `device` (`cookie` mode, when the client
        // named a browser) are metadata too; anything else would be a field that should not be here.
        const [session] = data.sessions;
        expect(Object.keys(session ?? {}).filter((key) => !EXPORTED_SESSION_KEYS.has(key))).toEqual(
            []
        );
        expect(session).toMatchObject({
            id: expect.any(String),
            createdAt: expect.any(String),
            expiration: expect.any(String)
        });
    });

    it('carries the invoice, the credit note and the cart line with exactly their documented fields', async () => {
        const { user, bearer } = await authenticateAs('user');
        const product = await createProduct({ price: 25, onHand: 5 });
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const orderId = String(order._id);
        const intent = await createIntent(orderId, asCustomer(user.id));
        if (!intent.success) throw new Error('intent refused');
        // The fake PSP's "always succeeds" reference.
        await confirmPayment(
            intent.data.id,
            'pm_card_visa',
            asCustomer(user.id),
            testCallerContext
        );
        await waitForCount(() =>
            invoicingService.findInvoiceForOrder(orderId).then((row) => +(row !== null))
        );
        await paymentService.refundByOrder(orderId, asAdmin(), callerContextAs('admin'));
        await waitForCount(() =>
            invoicingService.findCreditNotesForOrder(orderId).then((rows) => rows.length)
        );
        const added = await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 2 });
        expect(added.status).toBe(201);

        const response = await requestAndDownloadExport(bearer);

        const data = response.data as {
            invoicing: { invoices: object[]; creditNotes: object[] };
            cart: object[];
        };
        const documentFields = ['currency', 'grandTotal', 'issuedAt', 'number', 'orderId'];
        expect(data.invoicing.invoices.map((row) => Object.keys(row).toSorted())).toEqual([
            documentFields
        ]);
        expect(data.invoicing.creditNotes.map((row) => Object.keys(row).toSorted())).toEqual([
            documentFields
        ]);
        expect(data.cart).toEqual([{ productId: String(product._id), quantity: 2 }]);
    });

    it("never includes another account's orders", async () => {
        const { bearer } = await loginWithCookie();
        const stranger = await createUser({ email: 'export-stranger@example.com' });
        const product = await createProduct();
        const strangerOrder = await createOrder(stranger, [toOrderItem(product, 1)]);

        const response = await requestAndDownloadExport(bearer);

        const data = response.data as { orders: { id: string }[] };
        expect(data.orders.map((each) => each.id)).not.toContain(String(strangerOrder._id));
    });
});

describe('the address book at checkout', () => {
    const HOME = {
        label: 'home',
        fullName: 'Ada Lovelace',
        street: 'Via Roma 1',
        city: 'Modena',
        zip: '41121',
        country: 'IT'
    };

    it('checkout carries the snapshot the contract declares', async () => {
        const { bearer } = await authenticateAs('user');
        await api().post('/account/addresses').set('Authorization', bearer).send(HOME);
        const product = await createProduct({ onHand: 5 });
        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 1 });

        await api()
            .put('/cart/shipping-method')
            .set('Authorization', bearer)
            .send({ shippingMethodId: 'standard' });
        const response = await checkoutAs(bearer);

        expect(response.status).toBe(201);
        expect(response.body.data.shippingAddress).toMatchObject({
            fullName: 'Ada Lovelace',
            street: 'Via Roma 1'
        });
        // "Same as shipping" is the default when something ships.
        expect(response.body.data.billingAddress).toMatchObject({
            fullName: 'Ada Lovelace',
            street: 'Via Roma 1'
        });
    });
});
